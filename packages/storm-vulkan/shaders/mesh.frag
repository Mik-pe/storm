#version 450
// Cook-Torrance metallic-roughness PBR with a single directional sun and a
// hemisphere ambient stand-in for the sky. Reinhard tonemap + gamma.
layout(push_constant, std430) uniform Push {
    mat4 mvp;
    mat4 model;
    vec4 base_color;
    vec4 params;
    vec4 camera_pos;
} push;

layout(location = 0) in vec3 world_normal;
layout(location = 1) in vec3 world_position;
layout(location = 2) in vec4 vertex_base_color;
layout(location = 3) in vec4 vertex_params;
layout(location = 4) in vec3 vertex_camera;

layout(location = 0) out vec4 out_color;

const float PI = 3.14159265359;
const vec3 SUN_DIRECTION = vec3(0.45, 0.78, 0.42);
const vec3 SUN_COLOR = vec3(1.0, 0.95, 0.88) * 3.4;

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

void main() {
    vec3 n = normalize(world_normal);
    vec3 v = normalize(vertex_camera - world_position);
    vec3 l = normalize(SUN_DIRECTION);
    vec3 h = normalize(v + l);

    vec3 albedo = vertex_base_color.rgb;
    float metallic = clamp(vertex_params.x, 0.0, 1.0);
    float roughness = clamp(vertex_params.y, 0.045, 1.0);
    float emissive = max(vertex_params.z, 0.0);

    vec3 f0 = mix(vec3(0.04), albedo, metallic);
    float ndl = max(dot(n, l), 0.0);
    float ndv = max(dot(n, v), 0.0001);

    vec3 f = fresnel_schlick(max(dot(h, v), 0.0), f0);
    float d = distribution_ggx(n, h, roughness);
    float g = geometry_smith(ndv, ndl, roughness);
    vec3 specular = (d * g * f) / max(4.0 * ndv * ndl, 0.001);
    vec3 kd = (vec3(1.0) - f) * (1.0 - metallic);

    vec3 direct = (kd * albedo / PI + specular) * SUN_COLOR * ndl;

    // Hemisphere ambient: sky above, darker ground bounce below.
    vec3 sky_ambient = mix(vec3(0.09, 0.11, 0.15), vec3(0.34, 0.44, 0.58), n.y * 0.5 + 0.5);
    vec3 ambient = albedo * sky_ambient * (1.0 - metallic * 0.65);

    vec3 color = direct + ambient + albedo * emissive;
    color = color / (color + vec3(1.0));
    out_color = vec4(pow(color, vec3(1.0 / 2.2)), vertex_base_color.a);
}
