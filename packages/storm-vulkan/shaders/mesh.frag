#version 450
// Cook-Torrance metallic-roughness PBR.
//
// Lighting comes from three places that all agree on the same sky model:
//   * a directional sun, shadowed by a projected distance map,
//   * hemispheric irradiance for diffuse ambient,
//   * the sky gradient sampled along the reflection vector for specular
//     ambient, which is what makes metals read as metal without an env map.
// ACES tonemap, then gamma.
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

layout(location = 0) in vec3 world_normal;
layout(location = 1) in vec3 world_position;
layout(location = 2) in vec4 vertex_base_color;
layout(location = 3) in vec4 vertex_params;
layout(location = 4) in vec3 vertex_camera;
layout(location = 5) in vec4 sky_sun;
layout(location = 6) in vec4 sky_sun_color;
layout(location = 7) in vec4 sky_zenith;
layout(location = 8) in vec4 sky_horizon;

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

// Same curve the sky pass draws, so reflections match the visible dome. Below
// the horizon it falls away to a dim ground tone, which is what gives metals a
// horizon line in their reflections instead of a flat tint.
vec3 sky_gradient(vec3 dir) {
    if (dir.y < 0.0) {
        return mix(sky_horizon.rgb * 0.28, sky_horizon.rgb, clamp(1.0 + dir.y * 2.2, 0.0, 1.0));
    }
    return mix(sky_horizon.rgb, sky_zenith.rgb, pow(dir.y, 0.55));
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

    vec3 albedo = vertex_base_color.rgb;
    float metallic = clamp(vertex_params.x, 0.0, 1.0);
    float roughness = clamp(vertex_params.y, 0.045, 1.0);
    float emissive = max(vertex_params.z, 0.0);
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

    // --- ambient ---
    vec3 sky_up = sky_gradient(vec3(0.0, 1.0, 0.0));
    vec3 irradiance = mix(vec3(0.13, 0.15, 0.18), sky_up, n.y * 0.5 + 0.5);
    vec3 diffuse_ambient = albedo * (1.0 - metallic) * irradiance * 0.38;

    vec3 r = reflect(-v, n);
    vec3 env_dir = normalize(mix(vec3(r.x, 0.0, r.z), r, 1.0 - roughness));
    vec3 env = sky_gradient(env_dir);
    vec3 specular_ambient = env * fresnel_schlick(ndv, f0) * mix(0.65, 0.22, roughness);
    // A sharp reflection of the sun in the sky, so smooth metals show a glint
    // instead of a flat tint.
    float glint = pow(max(dot(r, l), 0.0), mix(420.0, 16.0, roughness));
    specular_ambient += sky_sun_color.rgb * sky_sun.w * glint * fresnel_schlick(ndv, f0) * 1.4;
    // Grazing angles brighten the sky reflection, which is what reads as a
    // polished surface rather than flat paint.
    specular_ambient *= 1.0 + 0.9 * pow(1.0 - ndv, 4.0);

    // Contact darkening where the sun is blocked, so shadows read on the ambient
    // term too instead of only killing the highlight.
    float ambient_occlusion = mix(0.55, 1.0, shadow);

    vec3 color = direct + (diffuse_ambient + specular_ambient) * ambient_occlusion + albedo * emissive;
    color = aces(color * 1.35);
    out_color = vec4(pow(color, vec3(1.0 / 2.2)), vertex_base_color.a);
}
