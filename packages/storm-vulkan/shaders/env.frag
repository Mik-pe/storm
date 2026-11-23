#version 450
// Environment cubemap face: the same sky curve as sky.frag, written as
// linear radiance in the same units as the direct sun (the sun is only a
// few times brighter than the sky here, so the map must not be gamma-encoded
// or it would be far too dark next to the direct term).
layout(location = 0) in vec3 direction;
layout(location = 0) out vec4 out_color;

layout(push_constant) uniform Push {
    vec4 right;
    vec4 up;
    vec4 forward;
    vec4 sun;
    vec4 zenith;
    vec4 horizon;
} push;

// Below the horizon the dome is a ground tone. A ground plane lit by the sky
// is brightest toward the horizon and darkens as it comes underfoot, so the
// tone fades with elevation; this is what gives downward reflections a
// gradient instead of a flat fill.
const float GROUND_NEAR = 0.18;
const float GROUND_FAR = 0.02;
const float SUN_DISC = 8.0;

void main() {
    vec3 d = normalize(direction);
    float up = clamp(d.y, -1.0, 1.0);
    vec3 sky = mix(push.horizon.rgb, push.zenith.rgb, pow(clamp(up, 0.0, 1.0), 0.45));
    vec3 ground = push.horizon.rgb * mix(GROUND_NEAR, GROUND_FAR, pow(clamp(-up, 0.0, 1.0), 0.5));
    vec3 colour = mix(ground, sky, smoothstep(-0.02, 0.0, up));
    float sun_amount = max(dot(d, normalize(push.sun.xyz)), 0.0);
    colour += vec3(1.0, 0.95, 0.85) * pow(sun_amount, 350.0) * SUN_DISC;
    out_color = vec4(colour, 1.0);
}
