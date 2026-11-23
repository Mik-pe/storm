#version 450
// Fullscreen triangle at the far plane. The fragment shader reconstructs a
// world-space view ray, so the sky is a real dome and not a screen gradient.
layout(push_constant, std430) uniform Sky {
    mat4 inv_view_proj;
    vec4 sun_direction;  // xyz towards the sun, w = intensity
    vec4 zenith;
    vec4 horizon;
} sky;

layout(location = 0) out vec3 view_ray;

void main() {
    vec2 p = vec2((gl_VertexIndex << 1) & 2, gl_VertexIndex & 2) * 2.0 - 1.0;
    gl_Position = vec4(p, 1.0, 1.0);
    vec4 world = sky.inv_view_proj * vec4(p, 1.0, 1.0);
    view_ray = world.xyz / world.w;
}
