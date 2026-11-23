#version 450
// Shadow pass: project with the light's view-projection and hand the distance
// along the light direction to the fragment stage.
layout(push_constant, std430) uniform Push {
    mat4 light_vp;
    mat4 model;
    vec4 light_dir_c;   // xyz = direction towards the light, w = dot(origin, dir)
} push;

layout(location = 0) in vec3 position;
layout(location = 1) in vec3 normal;

layout(location = 0) out float light_distance;

void main() {
    vec4 world = push.model * vec4(position, 1.0);
    light_distance = dot(world.xyz, push.light_dir_c.xyz) - push.light_dir_c.w;
    gl_Position = push.light_vp * world;
}
