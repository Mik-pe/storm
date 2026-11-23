#version 450
// Fullscreen triangle for the environment-map pass. The cube face's basis
// (right, up, forward) is passed in push constants, so the fragment shader
// gets a world-space direction without an inverse matrix: for a 90-degree
// perspective in Vulkan's Y-down clip space, a direction f + s*a + u*b lands
// at clip (a, -b), hence dir = forward + right * p.x - up * p.y.
layout(push_constant, std430) uniform Face {
    vec4 right;         // xyz = cross(up, forward), the spec's sc axis
    vec4 up;
    vec4 forward;
    vec4 sun_direction; // xyz towards the sun, w = intensity
    vec4 zenith;
    vec4 horizon;
} face;

layout(location = 0) out vec3 view_ray;

void main() {
    vec2 p = vec2((gl_VertexIndex << 1) & 2, gl_VertexIndex & 2) * 2.0 - 1.0;
    gl_Position = vec4(p, 1.0, 1.0);
    view_ray = face.forward.xyz + face.right.xyz * p.x - face.up.xyz * p.y;
}
