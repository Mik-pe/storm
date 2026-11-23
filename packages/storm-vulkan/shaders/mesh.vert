#version 450
// PBR mesh pipeline: world-space position and normal for lighting.
layout(push_constant, std430) uniform Push {
    mat4 mvp;
    mat4 model;
    vec4 base_color;
    vec4 params;      // metallic, roughness, emissive, unused
    vec4 camera_pos;  // xyz = eye position in world space
} push;

layout(location = 0) in vec3 position;
layout(location = 1) in vec3 normal;

layout(location = 0) out vec3 world_normal;
layout(location = 1) out vec3 world_position;
layout(location = 2) out vec4 vertex_base_color;
layout(location = 3) out vec4 vertex_params;
layout(location = 4) out vec3 vertex_camera;

void main() {
    vec4 world = push.model * vec4(position, 1.0);
    world_position = world.xyz;
    // Uniform scale is assumed; a non-uniform model matrix needs its inverse transpose.
    world_normal = mat3(push.model) * normal;
    vertex_base_color = push.base_color;
    vertex_params = push.params;
    vertex_camera = push.camera_pos.xyz;
    gl_Position = push.mvp * vec4(position, 1.0);
}
