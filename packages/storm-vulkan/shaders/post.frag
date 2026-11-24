#version 450
#extension GL_GOOGLE_include_directive : require
#include "display.glsl"

layout(set = 0, binding = 0) uniform sampler2D scene;
layout(push_constant, std430) uniform Post { vec4 params; } post;
layout(location = 0) out vec4 out_color;

vec3 post_read(sampler2D source, vec2 uv) {
    return textureLod(source, uv, 0.0).rgb;
}

float post_luma(vec3 color) {
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

// Find the closer end of the contrast edge, then sample across its normal.
// The search uses mip zero even inside divergent branches.
vec3 post_fxaa(sampler2D source, vec2 uv, vec2 px, vec3 center, vec3 n, vec3 s, vec3 w, vec3 e, float aa) {
    float m = post_luma(center);
    float north = post_luma(n), south = post_luma(s), west = post_luma(w), east = post_luma(e);
    float lo = min(m, min(min(north, south), min(west, east)));
    float hi = max(m, max(max(north, south), max(west, east)));
    float contrast = hi - lo;
    if (contrast < max(0.03125, hi * 0.105)) return center;

    float nw = post_luma(post_read(source, uv - px));
    float ne = post_luma(post_read(source, uv + vec2(px.x, -px.y)));
    float sw = post_luma(post_read(source, uv + vec2(-px.x, px.y)));
    float se = post_luma(post_read(source, uv + px));
    float horizontal = abs(nw + sw - 2.0 * west) + 2.0 * abs(north + south - 2.0 * m) + abs(ne + se - 2.0 * east);
    float vertical = abs(nw + ne - 2.0 * north) + 2.0 * abs(west + east - 2.0 * m) + abs(sw + se - 2.0 * south);
    bool across_y = horizontal >= vertical;
    float first = across_y ? north : west;
    float second = across_y ? south : east;
    bool negative = abs(first - m) >= abs(second - m);
    float neighbor = negative ? first : second;
    vec2 normal = across_y ? vec2(0.0, px.y) : vec2(px.x, 0.0);
    if (negative) normal = -normal;
    vec2 tangent = across_y ? vec2(px.x, 0.0) : vec2(0.0, px.y);
    vec2 edge_uv = uv + 0.5 * normal;
    float edge_luma = 0.5 * (m + neighbor);
    float threshold = max(0.002, 0.25 * abs(m - neighbor));
    float left = 10.0, right = 10.0;
    float left_delta = 0.0, right_delta = 0.0;
    for (int i = 1; i <= 8; i *= 2) {
        float distance = float(i);
        if (left == 10.0) {
            left_delta = post_luma(post_read(source, edge_uv - distance * tangent)) - edge_luma;
            if (abs(left_delta) >= threshold) left = distance;
        }
        if (right == 10.0) {
            right_delta = post_luma(post_read(source, edge_uv + distance * tangent)) - edge_luma;
            if (abs(right_delta) >= threshold) right = distance;
        }
        if (left < 10.0 && right < 10.0) break;
    }
    float end_delta = left < right ? left_delta : right_delta;
    float span = (end_delta < 0.0) != (m < edge_luma) ? 0.5 - min(left, right) / (left + right) : 0.0;
    float mean = (2.0 * (north + south + west + east) + nw + ne + sw + se) / 12.0;
    float subpixel = 0.38 * smoothstep(0.12, 0.80, abs(mean - m) / contrast);
    // Uniform rows or columns are already aligned with the pixel grid.
    // Endpoints further along a shallow diagonal can still request a span shift.
    float row_change = abs(west - east) + abs(nw - ne) + abs(sw - se);
    float column_change = abs(north - south) + abs(nw - sw) + abs(ne - se);
    subpixel *= smoothstep(0.02, 0.18, (across_y ? row_change : column_change) / contrast);
    float shift = max(span, subpixel);
    // A narrow line has contrast of the same sign on both sides. Keep its ink.
    if ((first - m) * (second - m) > 0.0 && min(abs(first - m), abs(second - m)) > 0.45 * contrast)
        shift = min(shift, 0.13);
    return post_read(source, uv + normal * (aa * shift));
}

vec3 post_linear(vec3 rgb) {
    return mix(pow((rgb + 0.055) / 1.055, vec3(2.4)), rgb / 12.92, lessThanEqual(rgb, vec3(0.04045)));
}
vec3 post_display(vec3 rgb) {
    return mix(1.055 * pow(rgb, vec3(1.0 / 2.4)) - 0.055, rgb * 12.92, lessThanEqual(rgb, vec3(0.0031308)));
}
vec3 post_highlight(vec3 color) {
    // A soft knee on the already tone-mapped scene isolates sunlit paint.
    float weight = smoothstep(0.68, 0.94, post_luma(color));
    if (weight == 0.0) return vec3(0.0);
    return post_linear(color) * weight;
}

vec3 post_color(sampler2D source, vec2 uv, vec2 px, float aa, float strength) {
    vec3 center = post_read(source, uv);
    if (aa <= 0.0 && strength <= 0.0) return center;
    vec2 x = vec2(px.x, 0.0), y = vec2(0.0, px.y);
    vec3 n = post_read(source, uv - y), s = post_read(source, uv + y);
    vec3 w = post_read(source, uv - x), e = post_read(source, uv + x);
    vec3 color = aa > 0.0 ? post_fxaa(source, uv, px, center, n, s, w, e, aa) : center;
    if (strength <= 0.0) return color;

    // Four near taps and four bilinear outer taps give highlights a small footprint.
    vec2 d = 1.5 * px;
    vec3 glow = 0.16 * (post_highlight(n) + post_highlight(s) + post_highlight(w) + post_highlight(e));
    glow += 0.09 * (post_highlight(post_read(source, uv - d)) + post_highlight(post_read(source, uv + d))
                  + post_highlight(post_read(source, uv + vec2(d.x, -d.y))) + post_highlight(post_read(source, uv + vec2(-d.x, d.y))));
    vec3 linear = post_linear(color);
    float light = smoothstep(0.035, 0.72, post_luma(linear));
    vec3 tint = mix(vec3(-0.030, 0.005, 0.052), vec3(0.085, 0.022, -0.045), light);
    vec3 graded = linear + strength * (vec3(1.0) - linear) * (linear * tint + 0.105 * glow);
    return post_display(clamp(graded, 0.0, 1.0));
}

void main() {
    // Fragment centers already include the half-texel offset, with y increasing down.
    vec4 p = post.params;
    out_color = display_color(post_color(scene, gl_FragCoord.xy * p.xy, p.xy, clamp(p.z, 0.0, 1.0), clamp(p.w, 0.0, 1.0)), 1.0);
}
