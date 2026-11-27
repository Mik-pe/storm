// Storm's Metal shaders: the GLSL in packages/storm-vulkan/shaders, ported
// one for one, so both backends shade a surface the same way.
//
// Storm's clip space is x right, y DOWN, z in [0, 1]. The backend's viewport
// mirrors y, so nothing here flips anything. Vertex data is interleaved
// [x, y, z, nx, ny, nz, u, v] (32 bytes).
//
// What Vulkan passes as push constants is a struct in the constant address
// space, bound by buffer index and readable by every stage. So each pass has
// exactly one struct, and a fragment function reads its constants from it
// instead of through a varying that is constant over the whole mesh.
#include <metal_stdlib>
using namespace metal;

// A fullscreen triangle covers the viewport with three vertices and no buffer.
static inline float2 fullscreen_point(uint vertex_id) {
    return float2(float((vertex_id << 1) & 2), float(vertex_id & 2)) * 2.0 - 1.0;
}

// ---- sky: the dome at the far plane ----

struct SkyPush {
    float4x4 inv_view_proj;
    float4 sun_direction; // xyz towards the sun, w = intensity
    float4 zenith;
    float4 horizon;
};

struct SkyOut {
    float4 position [[position]];
    float3 view_ray;
};

// The fragment rebuilds a world-space view ray, so the sky is a real dome and
// not a screen gradient.
vertex SkyOut sky_vertex(uint vid [[vertex_id]], constant SkyPush& sky [[buffer(0)]]) {
    float2 p = fullscreen_point(vid);
    SkyOut out;
    out.position = float4(p, 1.0, 1.0);
    float4 world = sky.inv_view_proj * float4(p, 1.0, 1.0);
    out.view_ray = world.xyz / world.w;
    return out;
}

fragment float4 sky_fragment(SkyOut in [[stage_in]], constant SkyPush& sky [[buffer(0)]]) {
    float3 dir = normalize(in.view_ray);
    float height = clamp(dir.y, -1.0, 1.0);
    float3 base = mix(sky.horizon.rgb, sky.zenith.rgb, pow(clamp(height, 0.0, 1.0), 0.55));
    // A clearing may keep the distant haze light when seen above the treetops.
    float haze = 1.0 - 0.5 * sky.horizon.w;
    base = mix(base * haze, base, smoothstep(-0.18, 0.02, height));

    float3 sun_dir = normalize(sky.sun_direction.xyz);
    float cos_angle = max(dot(dir, sun_dir), 0.0);
    float disc = pow(cos_angle, 1200.0);
    float glow = pow(cos_angle, 14.0);
    float3 sun = float3(1.0, 0.93, 0.80) * disc * 8.0 + float3(1.0, 0.72, 0.45) * glow * 0.30;

    return float4(base + sky.sun_direction.w * sun, 1.0);
}

// ---- mesh: Cook-Torrance metallic-roughness PBR with split-sum IBL ----
//
// Lighting comes from three places that all agree on the same sky model:
//   * a directional sun, shadowed by its depth map,
//   * diffuse irradiance from a cosine-convolved environment cube,
//   * specular from a roughness-prefiltered environment cube and a BRDF
//     lookup table: prefiltered(r, roughness) * (F0 * scale + bias).
// ACES tonemap, then gamma.

// The draw's own values: its two matrices, its material and the eye it
// is seen from.
struct MeshPush {
    float4x4 mvp;
    float4x4 model;
    float4 base_color;
    float4 params;          // metallic, roughness, emissive, shadows enabled
    float4 camera_pos;      // xyz = eye position in world space
    float4 emissive_factor; // rgb scales the emissive map, w = its strength
    float4 occlusion;       // x = occlusionTexture.strength, yzw unused
};

// The frame's values, the same on every draw of a frame: the sun's
// shadow lookup, the sun and the sky the surfaces are shaded with.
struct Light {
    float4x4 light_vp;      // sun view-projection
    float4 light_dir_c;     // xyz towards the sun, w = dot(light_origin, dir)
    float4 sun_direction;   // xyz towards the sun, w = intensity
    float4 sun_color;       // rgb, w = diffuse_fill
    float4 zenith;
    float4 horizon;
};

struct MeshVertex {
    float3 position [[attribute(0)]];
    float3 normal [[attribute(1)]];
    float2 uv [[attribute(2)]];
};

struct MeshOut {
    float4 position [[position]];
    float3 world_normal;
    float3 world_position;
    float2 uv;
};

vertex MeshOut mesh_vertex(MeshVertex in [[stage_in]], constant MeshPush& push [[buffer(1)]]) {
    float4 world = push.model * float4(in.position, 1.0);
    MeshOut out;
    float3 a = push.model[0].xyz, b = push.model[1].xyz, c = push.model[2].xyz;
    float3 co = cross(b, c);
    out.world_normal = (dot(a, co) < 0.0 ? -1.0 : 1.0) *
        (co * in.normal.x + cross(c, a) * in.normal.y + cross(a, b) * in.normal.z);
    out.world_position = world.xyz;
    out.uv = in.uv;
    out.position = push.mvp * float4(in.position, 1.0);
    return out;
}

constant const float PI = 3.14159265359;
constant const float ENV_MIPS = 6.0; // prefiltered_env mip count

float3 fresnel_schlick(float cos_theta, float3 f0) {
    return f0 + (float3(1.0) - f0) * pow(clamp(1.0 - cos_theta, 0.0, 1.0), 5.0);
}

float distribution_ggx(float3 n, float3 h, float roughness) {
    float a = roughness * roughness;
    float a2 = a * a;
    float ndh = max(dot(n, h), 0.0);
    float d = ndh * ndh * (a2 - 1.0) + 1.0;
    return a2 / max(PI * d * d, 0.0001);
}

float geometry_smith(float ndv, float ndl, float roughness) {
    float r = roughness + 1.0;
    float k = (r * r) / 8.0;
    float gv = ndv / (ndv * (1.0 - k) + k);
    float gl = ndl / (ndl * (1.0 - k) + k);
    return gv * gl;
}

float3 aces(float3 x) {
    const float a = 2.51;
    const float b = 0.03;
    const float c = 2.43;
    const float d = 0.59;
    const float e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

float4 bspline_weights(float t) {
    float t2 = t * t;
    float t3 = t2 * t;
    float one_minus_t = 1.0 - t;
    return float4(
        one_minus_t * one_minus_t * one_minus_t,
        3.0 * t3 - 6.0 * t2 + 4.0,
        -3.0 * t3 + 3.0 * t2 + 3.0 * t + 1.0,
        t3
    ) * (1.0 / 6.0);
}

// Cubic B-spline 4x4 PCF against the shadow depth map. It stores the
// light-space depth of the surface closest to the sun, the smallest depth in
// the texel; a fragment whose own depth is greater sits behind that surface,
// in its shadow. (The Vulkan backend's map is the other way round: it keeps
// the largest distance to the sun, so there a smaller distance is shadowed.)
// A normal-offset bias scaled by the light-space texel size and sin(theta)
// clears grazing self-shadowing across the 4x4 footprint without lifting
// contact shadows on flat sunlit ground.
float shadow_factor(float3 world_pos, float3 normal, float ndl, constant Light& light,
                    depth2d<float> shadow_map, sampler shadow_sampler) {
    float2 map_size = float2(float(shadow_map.get_width()), float(shadow_map.get_height()));
    float2 texel = 1.0 / map_size;
    // Row 0 of the orthographic light_vp has length 1 / radius; 2 / length is the frustum width.
    float row0_len = length(float3(light.light_vp[0].x, light.light_vp[1].x, light.light_vp[2].x));
    float world_per_texel = 2.0 / max(row0_len * map_size.x, 0.0001);

    float sin_theta = sqrt(max(1.0 - ndl * ndl, 0.0));
    float3 shadow_pos = world_pos + normal * (1.5 * world_per_texel * sin_theta);

    float4 lp = light.light_vp * float4(shadow_pos, 1.0);
    float3 ndc = lp.xyz / lp.w;
    float2 uv = ndc.xy * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { return 1.0; }

    // The length of the depth row is unchanged by the sun camera's rotation.
    float depth_scale = length(float3(light.light_vp[0].z, light.light_vp[1].z, light.light_vp[2].z));
    float bias = (0.75 * world_per_texel) * depth_scale;
    float compare = ndc.z - bias;

    float2 texel_pos = uv * map_size - 0.5;
    float2 base = floor(texel_pos);
    float2 f = texel_pos - base;
    float4 wx = bspline_weights(f.x);
    float4 wy = bspline_weights(f.y);

    float lit = 0.0;
    for (int y = 0; y < 4; ++y) {
        float row = 0.0;
        float sy = (base.y + float(y - 1) + 0.5) * texel.y;
        for (int x = 0; x < 4; ++x) {
            float sx = (base.x + float(x - 1) + 0.5) * texel.x;
            float stored = shadow_map.sample(shadow_sampler, float2(sx, sy));
            row += wx[x] * ((compare > stored) ? 0.0 : 1.0);
        }
        lit += wy[y] * row;
    }
    return lit;
}

fragment float4 mesh_fragment(MeshOut in [[stage_in]],
    constant MeshPush& push [[buffer(1)]],
    constant Light& light [[buffer(2)]],
    depth2d<float> shadow_map [[texture(0)]],
    texturecube<float> prefiltered_env [[texture(1)]],
    texturecube<float> irradiance_map [[texture(2)]],
    texture2d<float> brdf_lut [[texture(3)]],
    texture2d<float> base_texture [[texture(4)]],
    // The material's metallic-roughness map (G = roughness, B = metallic),
    // read as written: a linear texture. White (the fallback) leaves the
    // factors as they are.
    texture2d<float> metallic_roughness_texture [[texture(5)]],
    // The material's emissive map: what the surface gives off as light,
    // in its own colour (glTF 2.0 3.9.3). sRGB, like the base. White (the
    // fallback) times the zero factor of a surface without one is nothing.
    texture2d<float> emissive_texture [[texture(8)]],
    // The material's occlusion map (R channel), linear. White is the fallback.
    texture2d<float> occlusion_texture [[texture(7)]],
    sampler shadow_sampler [[sampler(0)]],
    sampler env_sampler [[sampler(1)]],
    sampler material_sampler [[sampler(2)]],
    sampler metallic_roughness_sampler [[sampler(3)]],
    sampler emissive_sampler [[sampler(6)]],
    sampler occlusion_sampler [[sampler(5)]]) {
    float3 n = normalize(in.world_normal);
    float3 v = normalize(push.camera_pos.xyz - in.world_position);
    float3 l = normalize(light.sun_direction.xyz);
    float3 h = normalize(v + l);

    // The material's base texture; white 1x1 when it has none, so the
    // multiply is the identity for untextured surfaces.
    float3 albedo = push.base_color.rgb * base_texture.sample(material_sampler, in.uv).rgb;
    // The factors multiply the map (glTF 2.0 3.9.2): a map that is white
    // leaves them as they are, and a factor of 1 is the map alone.
    float2 mr = metallic_roughness_texture.sample(metallic_roughness_sampler, in.uv).gb;
    float metallic = clamp(push.params.x * mr.y, 0.0, 1.0);
    float roughness = clamp(push.params.y * mr.x, 0.045, 1.0);
    float emissive = max(push.params.z, 0.0);
    // The emissive map's texel, scaled by the factor and the strength:
    // what the surface emits in its own colour, apart from its base.
    float3 emitted = emissive_texture.sample(emissive_sampler, in.uv).rgb * push.emissive_factor.rgb * push.emissive_factor.w;
    float shadows_on = push.params.w;

    float3 f0 = mix(float3(0.04), albedo, metallic);
    float ndl = max(dot(n, l), 0.0);
    float ndv = max(dot(n, v), 0.0001);

    float shadow = shadows_on > 0.5
        ? (ndl > 0.0 ? shadow_factor(in.world_position, n, ndl, light, shadow_map, shadow_sampler) : 0.0)
        : 1.0;

    // --- direct sun ---
    float3 f = fresnel_schlick(max(dot(h, v), 0.0), f0);
    float d = distribution_ggx(n, h, roughness);
    float g = geometry_smith(ndv, ndl, roughness);
    float3 specular = (d * g * f) / max(4.0 * ndv * ndl, 0.001);
    float3 kd = (float3(1.0) - f) * (1.0 - metallic);
    float3 sun = light.sun_color.rgb * light.sun_direction.w * shadow;
    float3 direct = (kd * albedo / PI + specular) * sun * ndl;

    // --- ambient: split-sum image-based lighting ---
    // Diffuse: irradiance convolved over the hemisphere. The map holds the raw
    // sample sum, so the 1 / PI of the integral is applied here. Metals have
    // no diffuse.
    float3 irradiance = irradiance_map.sample(env_sampler, n).rgb;
    float3 diffuse_ambient = albedo * (1.0 - metallic) * irradiance / PI;

    // Specular: prefiltered radiance along the reflection vector at the mip
    // that matches roughness, scaled by the integrated BRDF F0 * scale + bias.
    float3 r = reflect(-v, n);
    float lod = roughness * (ENV_MIPS - 1.0);
    float3 prefiltered = prefiltered_env.sample(env_sampler, r, level(lod)).rgb;
    float2 brdf = brdf_lut.sample(env_sampler, float2(ndv, roughness)).rg;
    float3 specular_ambient = prefiltered * (f0 * brdf.x + float3(brdf.y));

    // The occlusion map's R channel darkens the indirect light only
    // (glTF 2.0 3.9.3): 1 + strength * (occlusion - 1). White is the
    // fallback, so a surface without a map is unoccluded whatever its
    // strength, and a strength of 0 is the map ignored.
    float occluded = 1.0 + push.occlusion.x * (occlusion_texture.sample(occlusion_sampler, in.uv).r - 1.0);

    // Contact darkening where the sun is blocked, faded smoothly across the
    // shadow terminator so back-facing curved surfaces never expose raw
    // self-shadowing blocks.
    float shadow_lit = shadows_on > 0.5 ? shadow * smoothstep(0.0, 0.28, ndl) : 1.0;
    float ambient_occlusion = mix(0.55, 1.0, shadow_lit);

    float3 fill = mix(light.horizon.rgb * 0.75, light.zenith.rgb, n.y * 0.5 + 0.5) * light.sun_color.w;
    float3 color = albedo * (1.0 - metallic) * fill + direct + (diffuse_ambient + specular_ambient) * ambient_occlusion * occluded + albedo * emissive + emitted;
    color = aces(color * 1.35);
    return float4(pow(color, float3(1.0 / 2.2)), push.base_color.a);
}

// ---- shadow: the sun's depth map ----
//
// Depth only. The pass has no colour attachment and the pipeline no fragment
// function: the depth buffer itself is the shadow map.

struct ShadowPush {
    float4x4 light_vp;
    float4x4 model;
};

vertex float4 shadow_vertex(MeshVertex in [[stage_in]], constant ShadowPush& push [[buffer(1)]]) {
    float4 world = push.model * float4(in.position, 1.0);
    return push.light_vp * world;
}

// ---- scene postprocessing, before the editor ----

vertex float4 post_vertex(uint vid [[vertex_id]]) {
    return float4(fullscreen_point(vid), 0.0, 1.0);
}

float3 post_read(texture2d<float> source, float2 uv) {
    constexpr sampler bilinear(coord::normalized, address::clamp_to_edge, filter::linear);
    return source.sample(bilinear, uv, level(0.0)).rgb;
}

float post_luma(float3 color) {
    return dot(color, float3(0.2126, 0.7152, 0.0722));
}

// Find the closer end of the contrast edge, then sample across its normal.
// The search uses mip zero even inside divergent branches.
float3 post_fxaa(texture2d<float> source, float2 uv, float2 px, float3 center, float3 n, float3 s, float3 w, float3 e, float aa) {
    float m = post_luma(center);
    float north = post_luma(n), south = post_luma(s), west = post_luma(w), east = post_luma(e);
    float lo = min(m, min(min(north, south), min(west, east)));
    float hi = max(m, max(max(north, south), max(west, east)));
    float contrast = hi - lo;
    if (contrast < max(0.03125, hi * 0.105)) return center;

    float nw = post_luma(post_read(source, uv - px));
    float ne = post_luma(post_read(source, uv + float2(px.x, -px.y)));
    float sw = post_luma(post_read(source, uv + float2(-px.x, px.y)));
    float se = post_luma(post_read(source, uv + px));
    float horizontal = abs(nw + sw - 2.0 * west) + 2.0 * abs(north + south - 2.0 * m) + abs(ne + se - 2.0 * east);
    float vertical = abs(nw + ne - 2.0 * north) + 2.0 * abs(west + east - 2.0 * m) + abs(sw + se - 2.0 * south);
    bool across_y = horizontal >= vertical;
    float first = across_y ? north : west;
    float second = across_y ? south : east;
    bool negative = abs(first - m) >= abs(second - m);
    float neighbor = negative ? first : second;
    float2 normal = across_y ? float2(0.0, px.y) : float2(px.x, 0.0);
    if (negative) normal = -normal;
    float2 tangent = across_y ? float2(px.x, 0.0) : float2(0.0, px.y);
    float2 edge_uv = uv + 0.5 * normal;
    float edge_luma = 0.5 * (m + neighbor);
    float threshold = max(0.002, 0.25 * abs(m - neighbor));
    float left = 10.0, right = 10.0;
    float left_delta = 0.0, right_delta = 0.0;
    for (int i = 1; i <= 8; i *= 2) {
        float distance = float(i);
        if (left == 10.0) {
            left_delta = post_luma(post_read(source, edge_uv - distance * tangent)) - edge_luma;
            if (abs(left_delta) >= threshold) left = distance;
        }
        if (right == 10.0) {
            right_delta = post_luma(post_read(source, edge_uv + distance * tangent)) - edge_luma;
            if (abs(right_delta) >= threshold) right = distance;
        }
        if (left < 10.0 && right < 10.0) break;
    }
    float end_delta = left < right ? left_delta : right_delta;
    float span = (end_delta < 0.0) != (m < edge_luma) ? 0.5 - min(left, right) / (left + right) : 0.0;
    float mean = (2.0 * (north + south + west + east) + nw + ne + sw + se) / 12.0;
    float subpixel = 0.38 * smoothstep(0.12, 0.80, abs(mean - m) / contrast);
    // Uniform rows or columns are already aligned with the pixel grid.
    // Endpoints further along a shallow diagonal can still request a span shift.
    float row_change = abs(west - east) + abs(nw - ne) + abs(sw - se);
    float column_change = abs(north - south) + abs(nw - sw) + abs(ne - se);
    subpixel *= smoothstep(0.02, 0.18, (across_y ? row_change : column_change) / contrast);
    float shift = max(span, subpixel);
    // A narrow line has contrast of the same sign on both sides. Keep its ink.
    if ((first - m) * (second - m) > 0.0 && min(abs(first - m), abs(second - m)) > 0.45 * contrast)
        shift = min(shift, 0.13);
    return post_read(source, uv + normal * (aa * shift));
}

float3 post_linear(float3 rgb) {
    return select(pow((rgb + 0.055) / 1.055, float3(2.4)), rgb / 12.92, rgb <= 0.04045);
}
float3 post_display(float3 rgb) {
    return select(1.055 * pow(rgb, float3(1.0 / 2.4)) - 0.055, rgb * 12.92, rgb <= 0.0031308);
}
float3 post_highlight(float3 color) {
    // A soft knee on the already tone-mapped scene isolates sunlit paint.
    float weight = smoothstep(0.68, 0.94, post_luma(color));
    if (weight == 0.0) return float3(0.0);
    return post_linear(color) * weight;
}

float3 post_color(texture2d<float> source, float2 uv, float2 px, float aa, float strength) {
    float3 center = post_read(source, uv);
    if (aa <= 0.0 && strength <= 0.0) return center;
    float2 x = float2(px.x, 0.0), y = float2(0.0, px.y);
    float3 n = post_read(source, uv - y), s = post_read(source, uv + y);
    float3 w = post_read(source, uv - x), e = post_read(source, uv + x);
    float3 color = aa > 0.0 ? post_fxaa(source, uv, px, center, n, s, w, e, aa) : center;
    if (strength <= 0.0) return color;

    // Four near taps and four bilinear outer taps give highlights a small footprint.
    float2 d = 1.5 * px;
    float3 glow = 0.16 * (post_highlight(n) + post_highlight(s) + post_highlight(w) + post_highlight(e));
    glow += 0.09 * (post_highlight(post_read(source, uv - d)) + post_highlight(post_read(source, uv + d))
                  + post_highlight(post_read(source, uv + float2(d.x, -d.y))) + post_highlight(post_read(source, uv + float2(-d.x, d.y))));
    float3 linear = post_linear(color);
    float light = smoothstep(0.035, 0.72, post_luma(linear));
    float3 tint = mix(float3(-0.030, 0.005, 0.052), float3(0.085, 0.022, -0.045), light);
    float3 graded = linear + strength * (float3(1.0) - linear) * (linear * tint + 0.105 * glow);
    return post_display(clamp(graded, 0.0, 1.0));
}

fragment float4 post_fragment(float4 position [[position]], texture2d<float> scene [[texture(0)]],
                                 constant float4& params [[buffer(0)]]) {
    // Fragment centers already include the half-texel offset, with y increasing down.
    return float4(post_color(scene, position.xy * params.xy, params.xy, saturate(params.z), saturate(params.w)), 1.0);
}

// ---- ui: quads in points, y down the screen ----

struct UiPush {
    float4 screen; // xy = size in points
};

struct UiVertex {
    float4 pack0 [[attribute(0)]]; // xy = position, zw = uv
    float4 tint [[attribute(1)]];  // rgba
};

struct UiOut {
    float4 position [[position]];
    float2 uv;
    float4 color;
};

// The quads are in buffer 0; their one constant, the screen size, in buffer 1.
vertex UiOut ui_vertex(UiVertex in [[stage_in]], constant UiPush& push [[buffer(1)]]) {
    float2 ndc = float2(in.pack0.x / push.screen.x * 2.0 - 1.0,
                        in.pack0.y / push.screen.y * 2.0 - 1.0);
    UiOut out;
    out.position = float4(ndc, 0.0, 1.0);
    out.uv = in.pack0.zw;
    out.color = in.tint;
    return out;
}

fragment float4 ui_fragment(UiOut in [[stage_in]], texture2d<float> atlas [[texture(0)]], sampler atlas_sampler [[sampler(0)]]) {
    // A rectangle marks itself with a negative u: no lookup, full coverage.
    float coverage = in.uv.x < 0.0 ? 1.0 : atlas.sample(atlas_sampler, in.uv).r;
    return float4(in.color.rgb, in.color.a * coverage);
}

// ---- environment: the sky rendered into a cube, then convolved ----

// One block for all three environment passes: the cube face's basis first,
// so one vertex function serves them all, then what each fragment reads.
struct FacePush {
    float4 right;   // xyz = cross(up, forward), the spec's sc axis
    float4 up;
    float4 forward;
    float4 sun;     // the sky pass: xyz towards the sun, w = intensity; a convolve: x = roughness
    float4 zenith;
    float4 horizon;
};

struct FaceOut {
    float4 position [[position]];
    float3 view_ray;
};

// For a 90-degree perspective in Storm's y-down clip space a direction
// f + s * a + u * b lands at clip (a, -b), hence forward + right * p.x - up * p.y.
vertex FaceOut env_vertex(uint vid [[vertex_id]], constant FacePush& face [[buffer(0)]]) {
    float2 p = fullscreen_point(vid);
    FaceOut out;
    out.position = float4(p, 1.0, 1.0);
    out.view_ray = face.forward.xyz + face.right.xyz * p.x - face.up.xyz * p.y;
    return out;
}

// Linear radiance in the units of the direct sun: the sun is only a few
// times brighter than the sky, so the map must not be gamma-encoded.
fragment float4 env_fragment(FaceOut in [[stage_in]], constant FacePush& push [[buffer(0)]]) {
    const float GROUND_NEAR = 0.18;
    const float GROUND_FAR = 0.02;
    const float SUN_DISC = 8.0;

    float3 d = normalize(in.view_ray);
    float up = clamp(d.y, -1.0, 1.0);
    float3 sky = mix(push.horizon.rgb, push.zenith.rgb, pow(clamp(up, 0.0, 1.0), 0.45));
    // Below the horizon, a ground tone: brightest towards the horizon,
    // darkening as it comes underfoot.
    float3 ground = push.horizon.rgb * mix(GROUND_NEAR, GROUND_FAR, pow(clamp(-up, 0.0, 1.0), 0.5));
    float3 colour = mix(ground, sky, smoothstep(-0.02, 0.0, up));
    float sun_amount = max(dot(d, normalize(push.sun.xyz)), 0.0);
    colour += float3(1.0, 0.95, 0.85) * pow(sun_amount, 350.0) * SUN_DISC;
    return float4(colour, 1.0);
}

float radical_inverse_vdc(uint bits) {
    bits = (bits << 16u) | (bits >> 16u);
    bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
    bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
    bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
    bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
    return float(bits) * 2.3283064365386963e-10;
}

float2 hammersley(uint i, uint n) {
    return float2(float(i + 1) / float(n + 1), radical_inverse_vdc(i));
}

// One mip of the specular cube at a time, GGX importance-sampled from the
// previous, sharper mip of the source. Roughness is passed in, and the
// source is sampled at level 0: a convolve always reads the level it was
// given, whatever that level is in the cube.
fragment float4 prefilter_fragment(FaceOut in [[stage_in]], constant FacePush& prefilter [[buffer(0)]],
    texturecube<float> source_cube [[texture(0)]], sampler source_sampler [[sampler(0)]]) {
    const int SAMPLE_COUNT = 128;

    float3 n = normalize(in.view_ray);
    float roughness = prefilter.sun.x;
    float a = roughness * roughness;

    // A tangent frame around n with a generic up; a cube face's normal is
    // axis-aligned, so abs(n.z) < 0.999 picks a safe helper.
    float3 up = abs(n.z) < 0.999 ? float3(0.0, 0.0, 1.0) : float3(1.0, 0.0, 0.0);
    float3 tangent = normalize(cross(up, n));
    float3 bitangent = cross(n, tangent);

    float3 sum = float3(0.0);
    float weight = 0.0;
    for (int i = 0; i < SAMPLE_COUNT; ++i) {
        float2 xi = hammersley(uint(i), uint(SAMPLE_COUNT));
        // Importance-sample the GGX half vector.
        float phi = 2.0 * PI * xi.x;
        float cos_theta = sqrt((1.0 - xi.y) / (1.0 + (a * a - 1.0) * xi.y));
        float sin_theta = sqrt(1.0 - cos_theta * cos_theta);
        float3 h = tangent * (sin_theta * cos(phi)) + bitangent * (sin_theta * sin(phi)) + n * cos_theta;
        float3 l = normalize(2.0 * dot(n, h) * h - n);
        float ndl = dot(n, l);
        if (ndl <= 0.0) { continue; }
        sum += source_cube.sample(source_sampler, l, level(0.0)).rgb * ndl;
        weight += ndl;
    }
    return float4(sum / max(weight, 0.0001), 1.0);
}

// Diffuse irradiance: cosine-weighted convolution over the hemisphere around
// the surface normal, into a small cube since irradiance is very low
// frequency. Cosine sampling's PDF cancels its lobe, so only the 1 / PI of
// the integral remains, and the mesh shader applies it with the albedo.
fragment float4 irradiance_fragment(FaceOut in [[stage_in]], constant FacePush& face [[buffer(0)]],
    texturecube<float> source_cube [[texture(0)]], sampler source_sampler [[sampler(0)]]) {
    const int SAMPLE_COUNT = 256;

    float3 n = normalize(in.view_ray);
    float3 up = abs(n.z) < 0.999 ? float3(0.0, 0.0, 1.0) : float3(1.0, 0.0, 0.0);
    float3 tangent = normalize(cross(up, n));
    float3 bitangent = cross(n, tangent);

    float3 sum = float3(0.0);
    for (int i = 0; i < SAMPLE_COUNT; ++i) {
        float2 xi = hammersley(uint(i), uint(SAMPLE_COUNT));
        float r = sqrt(xi.x);
        float phi = 2.0 * PI * xi.y;
        float3 s = float3(r * cos(phi), r * sin(phi), sqrt(1.0 - xi.x));
        float3 l = tangent * s.x + bitangent * s.y + n * s.z;
        sum += source_cube.sample(source_sampler, normalize(l)).rgb;
    }
    return float4(sum / float(SAMPLE_COUNT), 1.0);
}
