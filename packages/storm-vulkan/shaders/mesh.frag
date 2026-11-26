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
    vec4 params;          // metallic, roughness, emissive, shadows enabled
    vec4 camera_pos;      // xyz = eye position in world space
    vec4 emissive_factor; // rgb scales the emissive map, w = its strength
} push;

layout(set = 0, binding = 0) uniform sampler2D shadow_map;
// The frame's values, the same block the vertex stage reads: written once
// per frame, not once per draw.
layout(set = 0, binding = 1) uniform Light {
    mat4 light_vp;       // sun view-projection
    vec4 light_dir_c;    // xyz towards the sun, w = dot(light_origin, dir)
    vec4 sun_direction;  // xyz towards the sun, w = intensity
    vec4 sun_color;      // rgb, w = diffuse_fill
    vec4 zenith;
    vec4 horizon;
} light;
layout(set = 0, binding = 2) uniform samplerCube prefiltered_env;
layout(set = 0, binding = 3) uniform samplerCube irradiance_map;
layout(set = 0, binding = 4) uniform sampler2D brdf_lut;
// The material's base texture, set 1: a white 1x1 texture when it has none,
// so the multiply below is the identity for untextured surfaces.
layout(set = 1, binding = 0) uniform sampler2D base_texture;
// The material's metallic-roughness map (G = roughness, B = metallic), read
// as written: a linear texture. White (the fallback) leaves the factors as
// they are, so a material without a map is unchanged.
layout(set = 1, binding = 1) uniform sampler2D metallic_roughness_texture;
// The material's emissive map: what the surface gives off as light, in its
// own colour (glTF 2.0 3.9.3). sRGB, like the base. White (the fallback)
// times the zero factor of a surface without one is nothing.
layout(set = 1, binding = 4) uniform sampler2D emissive_texture;

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
layout(location = 10) in vec4 vertex_emissive_factor;

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

// 3x3 PCF against the projected distance map.
float shadow_factor(vec3 world_pos, float ndl) {
    vec4 lp = light.light_vp * vec4(world_pos, 1.0);
    vec3 ndc = lp.xyz / lp.w;
    vec2 uv = ndc.xy * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { return 1.0; }

    float mine = dot(world_pos, light.light_dir_c.xyz) - light.light_dir_c.w;
    float bias = 0.06 + 0.14 * (1.0 - ndl);
    vec2 texel = 1.0 / vec2(textureSize(shadow_map, 0));
    float lit = 0.0;
    for (int y = -1; y <= 1; ++y) {
        for (int x = -1; x <= 1; ++x) {
            float stored = texture(shadow_map, uv + vec2(float(x), float(y)) * texel).r;
            // Stored is the largest distance, so a fragment further from the sun
            // than the front surface sits in its shadow.
            bool empty = stored < -SHADOW_FAR;
            bool shadowed = !empty && (mine + bias < stored);
            lit += shadowed ? 0.0 : 1.0;
        }
    }
    return lit / 9.0;
}

void main() {
    vec3 n = normalize(world_normal);
    vec3 v = normalize(vertex_camera - world_position);
    vec3 l = normalize(sky_sun.xyz);
    vec3 h = normalize(v + l);

    vec3 albedo = vertex_base_color.rgb * texture(base_texture, vertex_uv).rgb;
    // The factors multiply the map (glTF 2.0 3.9.2): a map that is white
    // leaves them as they are, and a factor of 1 is the map alone.
    vec2 mr = texture(metallic_roughness_texture, vertex_uv).gb;
    float metallic = clamp(vertex_params.x * mr.y, 0.0, 1.0);
    float roughness = clamp(vertex_params.y * mr.x, 0.045, 1.0);
    float emissive = max(vertex_params.z, 0.0);
    // The emissive map's texel, scaled by the factor and the strength: what
    // the surface emits in its own colour, apart from its base colour.
    vec3 emitted = texture(emissive_texture, vertex_uv).rgb * vertex_emissive_factor.rgb * vertex_emissive_factor.w;
    float shadows_on = vertex_params.w;

    vec3 f0 = mix(vec3(0.04), albedo, metallic);
    float ndl = max(dot(n, l), 0.0);
    float ndv = max(dot(n, v), 0.0001);

    float shadow = shadows_on > 0.5 ? shadow_factor(world_position, ndl) : 1.0;

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

    // Contact darkening where the sun is blocked, so shadows read on the ambient
    // term too instead of only killing the highlight.
    float ambient_occlusion = mix(0.55, 1.0, shadow);

    vec3 fill = mix(sky_horizon.rgb * 0.75, sky_zenith.rgb, n.y * 0.5 + 0.5) * sky_sun_color.w;
    vec3 color = albedo * (1.0 - metallic) * fill + direct + (diffuse_ambient + specular_ambient) * ambient_occlusion + albedo * emissive + emitted;
    color = aces(color * 1.35);
    out_color = display_color(pow(color, vec3(1.0 / 2.2)), vertex_base_color.a);
}
