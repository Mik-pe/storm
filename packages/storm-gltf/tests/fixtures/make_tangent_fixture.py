#!/usr/bin/env python3
"""Writes tangent_triangle.glb: one triangle with POSITION, NORMAL, TEXCOORD_0
and TANGENT. The file's tangent is deliberately NOT the frame a loader would
derive from the same triangle: the uv maps x to u and z to v (the derived
tangent is +x, w = -1), and the file says the tangent is +z with w = +1.

That is the fact a normal map needs from a file: exporters split vertices at
seams and bake a handedness a winding-derived basis cannot see, so the loader
must carry the file's four floats through, not "improve" them. A loader that
dropped TANGENT and derived would hand the test (1, 0, 0, -1) and fail.

The test never reads these constants: the expectations in suite.ddr were read
back from the file this writes:
    python3 make_tangent_fixture.py && python3 -c 'import json,struct;d=open("tangent_triangle.glb","rb").read();n=struct.unpack_from("<I",d,12)[0];print(json.dumps(json.loads(d[20:20+n]),indent=1));b=d[20+n+8:];print(struct.unpack_from("<9f",b,0));print(struct.unpack_from("<12f",b,36))'
"""
import json
import struct
from pathlib import Path

# The floor seen from above: x is u, z is v, the normal is +y -- the triangle
# gfx's own tangent test derives (1, 0, 0, -1) from.
positions = [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0]
normals = [0.0, 1.0, 0.0] * 3
uvs = [0.0, 0.0, 1.0, 0.0, 0.0, 1.0]
# The tangent is +z for every vertex, w = +1 (a right-handed frame with the
# normal): the opposite of what the uv Jacobian of this triangle derives.
tangents = [0.0, 0.0, 1.0, 1.0] * 3
bin_parts = [
    struct.pack("<9f", *positions),
    struct.pack("<9f", *normals),
    struct.pack("<6f", *uvs),
    struct.pack("<12f", *tangents),
    bytes([0, 1, 2]),
]
views = []
offset = 0
for part in bin_parts:
    views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(part)})
    offset += len(part)
binary = b"".join(bin_parts)

doc = {
    "asset": {"version": "2.0"},
    "scene": 0,
    "scenes": [{"nodes": [0]}],
    "nodes": [{"mesh": 0}],
    "meshes": [{"primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1, "TEXCOORD_0": 2, "TANGENT": 3}, "indices": 4}]}],
    "accessors": [
        {"bufferView": 0, "componentType": 5126, "count": 3, "type": "VEC3"},
        {"bufferView": 1, "componentType": 5126, "count": 3, "type": "VEC3"},
        {"bufferView": 2, "componentType": 5126, "count": 3, "type": "VEC2"},
        {"bufferView": 3, "componentType": 5126, "count": 3, "type": "VEC4"},
        {"bufferView": 4, "componentType": 5121, "count": 3, "type": "SCALAR"},
    ],
    "bufferViews": views,
    "buffers": [{"byteLength": len(binary)}],
}
json_bytes = json.dumps(doc, separators=(",", ":")).encode("utf-8")
json_bytes += b" " * ((4 - len(json_bytes) % 4) % 4)
binary += b"\x00" * ((4 - len(binary) % 4) % 4)

total = 12 + 8 + len(json_bytes) + 8 + len(binary)
out = Path(__file__).with_name("tangent_triangle.glb")
out.write_bytes(
    struct.pack("<III", 0x46546C67, 2, total)
    + struct.pack("<II", len(json_bytes), 0x4E4F534A) + json_bytes
    + struct.pack("<II", len(binary), 0x004E4942) + binary
)
print(f"{out} {out.stat().st_size} bytes")
