#version 450
// UI quads in screen-space pixels; the push constant carries the logical size.
layout(push_constant, std430) uniform Push {
    vec4 screen;
} push;

layout(location = 0) in vec4 pack0;   // xy = position, zw = uv
layout(location = 1) in vec4 tint;    // rgba

layout(location = 0) out vec2 v_uv;
layout(location = 1) out vec4 v_color;

void main() {
    vec2 ndc = vec2(pack0.x / push.screen.x * 2.0 - 1.0,
                    1.0 - pack0.y / push.screen.y * 2.0);
    gl_Position = vec4(ndc, 0.0, 1.0);
    v_uv = pack0.zw;
    v_color = tint;
}
