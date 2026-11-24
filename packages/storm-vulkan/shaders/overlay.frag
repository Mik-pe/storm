#version 450
#extension GL_GOOGLE_include_directive : require
#include "display.glsl"
// Cinematic overlay: vignette, film grain, scanlines and a cool grade.
// Drawn as one fullscreen triangle over the finished scene, blended in.
layout(push_constant, std430) uniform Push {
    vec4 screen_time;   // xy = size, z = time, w = strength
} push;

layout(location = 0) out vec4 out_color;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
    vec2 size = push.screen_time.xy;
    float time = push.screen_time.z;
    float amount = push.screen_time.w;

    vec2 uv = gl_FragCoord.xy / size;
    vec2 from_center = uv - vec2(0.5);
    float dist = length(from_center) * 1.4;

    // Vignette: transparent in the middle, dark towards the corners.
    float vignette = smoothstep(0.45, 1.15, dist) * 0.42;

    // Film grain, re-seeded every frame.
    float grain = hash(gl_FragCoord.xy + vec2(time * 137.0)) - 0.5;

    // Fine scanlines.
    float scan = (sin(gl_FragCoord.y * 2.0944) * 0.5 + 0.5) * 0.025;

    float alpha = (vignette + scan + grain * 0.05) * 0.45 * amount;
    if (alpha < 0.0) { alpha = 0.0; }

    // Cool shadow grade: the overlay is dark blue rather than neutral black.
    vec3 tint = vec3(0.02, 0.05, 0.11);
    out_color = display_color(tint, alpha);
}
