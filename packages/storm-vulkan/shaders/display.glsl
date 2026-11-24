// Storm authors its final colors in display space. An sRGB attachment applies
// the transfer function on store, so supply its inverse exactly once.
layout(constant_id = 0) const bool srgb_attachment = false;

vec4 display_color(vec3 rgb, float alpha) {
    if (!srgb_attachment) return vec4(rgb, alpha);
    vec3 linear = mix(pow((max(rgb, 0.0) + 0.055) / 1.055, vec3(2.4)),
                      rgb / 12.92, lessThanEqual(rgb, vec3(0.04045)));
    return vec4(linear, alpha);
}
