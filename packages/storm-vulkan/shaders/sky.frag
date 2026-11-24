#version 450
#extension GL_GOOGLE_include_directive : require
#include "display.glsl"
layout(push_constant, std430) uniform Sky {
    mat4 inv_view_proj;
    vec4 sun_direction;
    vec4 zenith;
    vec4 horizon;
} sky;

layout(location = 0) in vec3 view_ray;
layout(location = 0) out vec4 out_color;

void main() {
    vec3 dir = normalize(view_ray);
    float height = clamp(dir.y, -1.0, 1.0);
    vec3 base = mix(sky.horizon.rgb, sky.zenith.rgb, pow(clamp(height, 0.0, 1.0), 0.55));
    // Fade towards a dim ground haze below the horizon.
    base = mix(base * 0.5, base, smoothstep(-0.18, 0.02, height));

    vec3 sun_dir = normalize(sky.sun_direction.xyz);
    float cos_angle = max(dot(dir, sun_dir), 0.0);
    float disc = pow(cos_angle, 1200.0);
    float glow = pow(cos_angle, 14.0);
    vec3 sun = vec3(1.0, 0.93, 0.80) * disc * 8.0 + vec3(1.0, 0.72, 0.45) * glow * 0.30;

    out_color = display_color(base + sky.sun_direction.w * sun, 1.0);
}
