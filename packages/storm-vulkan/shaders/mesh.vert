#version 450
// PBR mesh pipeline: world-space position and normal for lighting, uv for
// the base colour texture (next-steps 3b).
layout(push_constant, std430) uniform Push {
    mat4 mvp;
    mat4 model;
    vec4 base_color;
    vec4 params;         // metallic, roughness, emissive, shadows enabled
    vec4 camera_pos;     // xyz = eye position in world space
    vec4 sun_direction;  // xyz towards the sun, w = intensity
    vec4 sun_color;
    vec4 zenith;
    vec4 horizon;
} push;

layout(location = 0) in vec3 position;
layout(location = 1) in vec3 normal;
layout(location = 2) in vec2 uv;

layout(location = 0) out vec3 world_normal;
layout(location = 1) out vec3 world_position;
layout(location = 2) out vec4 vertex_base_color;
layout(location = 3) out vec4 vertex_params;
layout(location = 4) out vec3 vertex_camera;
layout(location = 5) out vec4 sky_sun;
layout(location = 6) out vec4 sky_sun_color;
layout(location = 7) out vec4 sky_zenith;
layout(location = 8) out vec4 sky_horizon;
layout(location = 9) out vec2 vertex_uv;

void main() {
    vec4 world = push.model * vec4(position, 1.0);
    world_position = world.xyz;
    // Uniform scale is assumed; a non-uniform model matrix needs its inverse transpose.
    world_normal = mat3(push.model) * normal;
    vertex_base_color = push.base_color;
    vertex_params = push.params;
    vertex_camera = push.camera_pos.xyz;
    sky_sun = push.sun_direction;
    sky_sun_color = push.sun_color;
    sky_zenith = push.zenith;
    sky_horizon = push.horizon;
    vertex_uv = uv;
    gl_Position = push.mvp * vec4(position, 1.0);
}
