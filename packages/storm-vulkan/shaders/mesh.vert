#version 450
// PBR mesh pipeline: world-space position and normal for lighting, uv for
// the base colour texture (next-steps 3b).
//
// The push block holds what is the draw's own: its two matrices, its
// material and the eye it is seen from. What is the frame's (the sun and
// the sky) is set 0's uniform, written once per frame.
layout(push_constant, std430) uniform Push {
    mat4 mvp;
    mat4 model;
    vec4 base_color;
    vec4 params;          // metallic, roughness, emissive, shadows enabled
    vec4 camera_pos;      // xyz = eye position in world space
    vec4 emissive_factor; // rgb scales the emissive map, w = its strength
    vec4 occlusion;       // x = occlusionTexture.strength, y = normalTexture.scale
    vec4 sightline;       // xyz = eye to subject, w = outer radius at subject
} push;

layout(set = 0, binding = 1) uniform Light {
    mat4 light_vp;       // sun view-projection
    vec4 light_dir_c;    // xyz towards the sun, w = dot(light_origin, dir)
    vec4 sun_direction;  // xyz towards the sun, w = intensity
    vec4 sun_color;      // rgb, w = diffuse_fill
    vec4 zenith;
    vec4 horizon;
} light;

layout(location = 0) in vec3 position;
layout(location = 1) in vec3 normal;
layout(location = 2) in vec2 uv;
// The tangent basis (xyz = +dp/du, w = sign of the bitangent): declared by
// the vertex layout because the stream carries it, and handed to the
// fragment stage, which reads the normal map through it (3e step (c)).
layout(location = 3) in vec4 tangent;

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
layout(location = 10) out vec4 vertex_emissive_factor;
layout(location = 11) out vec4 vertex_occlusion;
// The tangent in world space, turned by the model matrix's linear part
// as a direction is, its w the file's handedness as bound.
layout(location = 12) out vec4 world_tangent;

void main() {
    vec4 world = push.model * vec4(position, 1.0);
    world_position = world.xyz;
    vec3 a = push.model[0].xyz, b = push.model[1].xyz, c = push.model[2].xyz;
    vec3 co = cross(b, c);
    world_normal = (dot(a, co) < 0.0 ? -1.0 : 1.0) *
        (co * normal.x + cross(c, a) * normal.y + cross(a, b) * normal.z);
    // The tangent is a direction in the surface (dp/du), not a normal: it
    // takes the model matrix as a direction does, its linear part -- the
    // cofactor form above is the normal's, and on a scaled model it bends
    // the tangent away from the surface. The w is the file's, and a
    // mirroring model leaves both as they are: cross(n, t) * w then points
    // where the mirrored island's texture does.
    world_tangent = vec4(a * tangent.x + b * tangent.y + c * tangent.z, tangent.w);
    vertex_base_color = push.base_color;
    vertex_params = push.params;
    vertex_camera = push.camera_pos.xyz;
    sky_sun = light.sun_direction;
    sky_sun_color = light.sun_color;
    sky_zenith = light.zenith;
    sky_horizon = light.horizon;
    vertex_uv = uv;
    vertex_emissive_factor = push.emissive_factor;
    vertex_occlusion = push.occlusion;
    gl_Position = push.mvp * vec4(position, 1.0);
}
