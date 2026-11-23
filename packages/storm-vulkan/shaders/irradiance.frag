#version 450
// Diffuse irradiance: cosine-weighted convolution of the environment cube
// over the hemisphere around the surface normal. Written into a small
// (16-32 pixel) cube since irradiance is extremely low frequency.
// Same push block as the environment pass so the vertex shader can rebuild
// the face direction; the fragment shader reads none of it.
layout(push_constant, std430) uniform Face {
    vec4 right;
    vec4 up;
    vec4 forward;
} face;

layout(set = 0, binding = 0) uniform samplerCube source_cube;

layout(location = 0) in vec3 view_ray;
layout(location = 0) out vec4 out_color;

const int SAMPLE_COUNT = 256;
const float PI = 3.14159265359;

float radical_inverse_vdc(uint bits) {
    bits = (bits << 16u) | (bits >> 16u);
    bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
    bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
    bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
    bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
    return float(bits) * 2.3283064365386963e-10;
}

vec2 hammersley(uint i, uint n) {
    return vec2(float(i + 1) / float(n + 1), radical_inverse_vdc(i));
}

vec3 cosine_sample_hemisphere(vec2 xi) {
    float r = sqrt(xi.x);
    float phi = 2.0 * PI * xi.y;
    return vec3(r * cos(phi), r * sin(phi), sqrt(1.0 - xi.x));
}

void main() {
    vec3 n = normalize(view_ray);
    vec3 up = abs(n.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
    vec3 tangent = normalize(cross(up, n));
    vec3 bitangent = cross(n, tangent);

    vec3 sum = vec3(0.0);
    for (int i = 0; i < SAMPLE_COUNT; ++i) {
        vec3 s = cosine_sample_hemisphere(hammersley(uint(i), uint(SAMPLE_COUNT)));
        vec3 l = tangent * s.x + bitangent * s.y + n * s.z;
        // Cosine sampling's PDF is cos(theta) / PI, so the cosine lobes
        // cancel and only the 1 / PI of the irradiance integral remains;
        // the shader applies that 1 / PI together with albedo.
        sum += texture(source_cube, normalize(l)).rgb;
    }
    out_color = vec4(sum / float(SAMPLE_COUNT), 1.0);
}
