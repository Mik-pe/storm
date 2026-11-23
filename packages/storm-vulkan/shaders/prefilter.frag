#version 450
// Prefiltered specular environment: one mip level of the output cube at a
// time, GGX importance-sampled from the previous (sharper) level of the
// source cube. Roughness = mip / (mips - 1). The source is bound through a
// view that exposes exactly one mip level, so it is sampled at LOD 0. The
// output is a single mip of a 6-layer cube, written through a per-layer
// framebuffer view. This is the UE4 formulation: NdotL-weighted average of
// the importance-sampled radiance, which pairs with the BRDF LUT's (scale,
// bias) split.
// Same push block as the environment pass: the vertex shader rebuilds the
// face direction from the basis, the fragment shader adds the roughness.
layout(push_constant, std430) uniform Prefilter {
    vec4 right;
    vec4 up;
    vec4 forward;
    vec4 params; // x = roughness
} prefilter;

layout(set = 0, binding = 0) uniform samplerCube source_cube;

layout(location = 0) in vec3 view_ray;
layout(location = 0) out vec4 out_color;

const int SAMPLE_COUNT = 128;
const float PI = 3.14159265359;

float radical_inverse_vdc(uint bits) {
    bits = (bits << 16u) | (bits >> 16u);
    bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
    bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
    bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
    bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
    return float(bits) * 2.3283064365386963e-10; // / 0x100000000
}

vec2 hammersley(uint i, uint n) {
    return vec2(float(i + 1) / float(n + 1), radical_inverse_vdc(i));
}

vec3 importance_sample_ggx(vec2 xi, vec3 n, float roughness) {
    float a = roughness * roughness;
    float phi = 2.0 * PI * xi.x;
    float cos_theta = sqrt((1.0 - xi.y) / (1.0 + (a * a - 1.0) * xi.y));
    float sin_theta = sqrt(1.0 - cos_theta * cos_theta);
    vec3 h = vec3(sin_theta * cos(phi), sin_theta * sin(phi), cos_theta);
    // Tangent frame around n with a generic up; the cube-face normal is
    // axis-aligned so abs(n.z) < 0.999 picks a safe helper.
    vec3 up = abs(n.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
    vec3 tangent = normalize(cross(up, n));
    vec3 bitangent = cross(n, tangent);
    return normalize(tangent * h.x + bitangent * h.y + n * h.z);
}

void main() {
    vec3 n = normalize(view_ray);
    float roughness = prefilter.params.x;

    vec3 sum = vec3(0.0);
    float weight = 0.0;
    for (int i = 0; i < SAMPLE_COUNT; ++i) {
        vec2 xi = hammersley(uint(i), uint(SAMPLE_COUNT));
        vec3 h = importance_sample_ggx(xi, n, roughness);
        vec3 l = normalize(2.0 * dot(n, h) * h - n);
        float ndl = dot(n, l);
        if (ndl <= 0.0) { continue; }
        sum += textureLod(source_cube, l, 0.0).rgb * ndl;
        weight += ndl;
    }
    out_color = vec4(sum / max(weight, 0.0001), 1.0);
}
