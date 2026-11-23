#version 450
// The shadow target is a plain colour image: MAX blending keeps the largest
// distance along the light direction per texel, i.e. the surface closest to the
// sun, which is exactly a depth map. This driver refuses to create a depth image
// with optimal tiling, so this is the substitute.
layout(location = 0) in float light_distance;
layout(location = 0) out vec4 out_color;

void main() {
    out_color = vec4(light_distance, light_distance, light_distance, 1.0);
}
