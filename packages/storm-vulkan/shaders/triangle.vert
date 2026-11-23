#version 450
// Storm default pipeline: clip-space positions, per-vertex color, push-constant MVP.
layout(push_constant, std430) uniform Push {
    mat4 mvp;
} push;

layout(location = 0) in vec3 position;
layout(location = 1) in vec4 color;

layout(location = 0) out vec4 vertex_color;

void main() {
    vertex_color = color;
    gl_Position = push.mvp * vec4(position, 1.0);
}
