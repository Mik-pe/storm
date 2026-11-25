#version 450
#extension GL_GOOGLE_include_directive : require
#include "display.glsl"
// Cook-Torrance metallic-roughness PBR with split-sum image-based lighting.
//
// Lighting comes from three places that all agree on the same sky model:
//   * a directional sun, shadowed by a projected distance map,
//   * diffuse irradiance from a cosine-convolved environment cubemap,
//   * specular from a roughness-prefiltered environment cubemap and a
//     BRDF lookup table:  env_prefiltered(r, roughness) * (F0 * scale + bias).
// The environment is rendered once from the sky dome (env.frag), so metals
// reflect the real sky: a horizon line, a sun highlight and blur that grows
// with roughness. ACES tonemap, then gamma.
layout(push_constant, std430) uniform Push {
    mat4 mvp;
    mat4 model;
    vec4 base_color;
    vec4 params;
    vec4 camera_pos;
    vec4 sun_direction;
    vec4 sun_color;
    vec4 zenith;
    vec4 horizon;
} push;

layout(set = 0, binding = 0) uniform sampler2D shadow_map;
layout(set = 0, binding = 1) uniform Light {
    mat4 light_vp;       // sun view-projection
    vec4 light_dir_c;    // xyz towards the sun, w = dot(light_origin, dir)
} light;
layout(set = 0, binding = 2) uniform samplerCube prefiltered_env;
layout(set = 0, binding = 3) uniform samplerCube irradiance_map;
layout(set = 0, binding = 4) uniform sampler2D brdf_lut;

const float ENV_MIPS = 6.0;   // prefiltered_env mip count

layout(location = 0) in vec3 world_normal;
layout(location = 1) in vec3 world_position;
layout(location = 2) in vec4 vertex_base_color;
layout(location = 3) in vec4 vertex_params;
layout(location = 4) in vec3 vertex_camera;
layout(location = 5) in vec4 sky_sun;
layout(location = 6) in vec4 sky_sun_color;
layout(location = 7) in vec4 sky_zenith;
layout(location = 8) in vec4 sky_horizon;
layout(location = 9) in vec2 vertex_uv;

layout(location = 0) out vec4 out_color;

const float PI = 3.14159265359;
const float SHADOW_FAR = 1000.0;

vec3 fresnel_schlick(float cos_theta, vec3 f0) {
    return f0 + (vec3(1.0) - f0) * pow(clamp(1.0 - cos_theta, 0.0, 1.0), 5.0);
}

float distribution_ggx(vec3 n, vec3 h, float roughness) {
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

vec3 aces(vec3 x) {
    const float a = 2.51;
    const float b = 0.03;
    const float c = 2.43;
    const float d = 0.59;
    const float e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

vec4 bspline_weights(float t) {
    float t2 = t * t;
    float t3 = t2 * t;
    float one_minus_t = 1.0 - t;
    return vec4(
        one_minus_t * one_minus_t * one_minus_t,
        3.0 * t3 - 6.0 * t2 + 4.0,
        -3.0 * t3 + 3.0 * t2 + 3.0 * t + 1.0,
        t3
    ) * (1.0 / 6.0);
}

// Cubic B-spline 4x4 PCF against the projected distance map.
float shadow_factor(vec3 world_pos, vec3 normal, float ndl) {
    vec2 map_size = vec2(textureSize(shadow_map, 0));
    vec2 texel = 1.0 / map_size;
    float row0_len = length(vec3(light.light_vp[0].x, light.light_vp[1].x, light.light_vp[2].x));
    float world_per_texel = 2.0 / max(row0_len * map_size.x, 0.0001);

    float sin_theta = sqrt(max(1.0 - ndl * ndl, 0.0));
    vec3 shadow_pos = world_pos + normal * (1.5 * world_per_texel * sin_theta);

    vec4 lp = light.light_vp * vec4(shadow_pos, 1.0);
    vec3 ndc = lp.xyz / lp.w;
    vec2 uv = ndc.xy * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { return 1.0; }

    float mine = dot(shadow_pos, light.light_dir_c.xyz) - light.light_dir_c.w;
    float bias = 0.75 * world_per_texel;
    float compare = mine + bias;

    vec2 texel_pos = uv * map_size - 0.5;
    vec2 base = floor(texel_pos);
    vec2 f = texel_pos - base;
    vec4 wx = bspline_weights(f.x);
    vec4 wy = bspline_weights(f.y);

    float lit = 0.0;
    for (int y = 0; y < 4; ++y) {
        float row = 0.0;
        float sy = (base.y + float(y - 1) + 0.5) * texel.y;
        for (int x = 0; x < 4; ++x) {
            float sx = (base.x + float(x - 1) + 0.5) * texel.x;
            float stored = textureLod(shadow_map, vec2(sx, sy), 0.0).r;
            // Stored is the largest distance, so a fragment further from the sun
            // than the front surface sits in its shadow.
            bool empty = stored < -SHADOW_FAR;
            bool shadowed = !empty && (compare < stored);
            row += wx[x] * (shadowed ? 0.0 : 1.0);
        }
        lit += wy[y] * row;
    }
    return lit;
}

void main() {
    vec3 n = normalize(world_normal);
    vec3 v = normalize(vertex_camera - world_position);
    vec3 l = normalize(sky_sun.xyz);
    vec3 h = normalize(v + l);

    vec3 albedo = vertex_base_color.rgb;
    float metallic = clamp(vertex_params.x, 0.0, 1.0);
    float roughness = clamp(vertex_params.y, 0.045, 1.0);
    float emissive = max(vertex_params.z, 0.0);
    float shadows_on = vertex_params.w;

    vec3 f0 = mix(vec3(0.04), albedo, metallic);
    float ndl = max(dot(n, l), 0.0);
    float ndv = max(dot(n, v), 0.0001);

    float shadow = shadows_on > 0.5
        ? (ndl > 0.0 ? shadow_factor(world_position, n, ndl) : 0.0)
        : 1.0;

    // --- direct sun ---
    vec3 f = fresnel_schlick(max(dot(h, v), 0.0), f0);
    float d = distribution_ggx(n, h, roughness);
    float g = geometry_smith(ndv, ndl, roughness);
    vec3 specular = (d * g * f) / max(4.0 * ndv * ndl, 0.001);
    vec3 kd = (vec3(1.0) - f) * (1.0 - metallic);
    vec3 sun = sky_sun_color.rgb * sky_sun.w * shadow;
    vec3 direct = (kd * albedo / PI + specular) * sun * ndl;

    // --- ambient: split-sum image-based lighting ---
    // Diffuse: irradiance convolved over the hemisphere (irradiance_map; the
    // map holds the raw sample sum, so the 1 / PI of the integral is applied
    // here) times kd * albedo. Metals have no diffuse.
    vec3 irradiance = texture(irradiance_map, n).rgb;
    vec3 diffuse_ambient = albedo * (1.0 - metallic) * irradiance / PI;

    // Specular: prefiltered radiance along the reflection vector at the mip
    // that matches roughness, scaled by the integrated BRDF F0 * scale + bias.
    vec3 r = reflect(-v, n);
    float lod = roughness * (ENV_MIPS - 1.0);
    vec3 prefiltered = textureLod(prefiltered_env, r, lod).rgb;
    vec2 brdf = texture(brdf_lut, vec2(ndv, roughness)).rg;
    vec3 specular_ambient = prefiltered * (f0 * brdf.x + vec3(brdf.y));

    // Contact darkening where the sun is blocked, faded smoothly across the
    // shadow terminator so back-facing curved surfaces never expose raw
    // self-shadowing blocks.
    float shadow_lit = shadows_on > 0.5 ? shadow * smoothstep(0.0, 0.28, ndl) : 1.0;
    float ambient_occlusion = mix(0.55, 1.0, shadow_lit);

    vec3 fill = mix(sky_horizon.rgb * 0.75, sky_zenith.rgb, n.y * 0.5 + 0.5) * sky_sun_color.w;
    vec3 color = albedo * (1.0 - metallic) * fill + direct + (diffuse_ambient + specular_ambient) * ambient_occlusion + albedo * emissive;
    color = aces(color * 1.35);
    out_color = display_color(pow(color, vec3(1.0 / 2.2)), vertex_base_color.a);
}
