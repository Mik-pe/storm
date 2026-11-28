#!/usr/bin/env python3
"""Writes animated_triangle.glb: one triangle whose node is named "spinner" and
carries one animation, "Turn", with three tracks on that node:

  translation  3 keys, LINEAR, VEC3: (0,0,0) at 0 s, (1,0,0) at 1 s, (2,0,0) at 2 s
  rotation     4 keys, LINEAR, VEC4 (quaternion xyzw): a quarter turn about y
               taken in three even steps -- 0, 30, 60, 90 degrees at 0, 1, 2, 3 s
  scale        2 keys, STEP,    VEC3: (1,1,1) at 0 s, (2,2,2) at 1.5 s

so duration = 3 s (the largest accessor max), and each interpolation path has
one track. refused_step_rotation.glb is the same with the rotation track marked
CUBICSPLINE, which Storm does not read; refused_unnamed_target.glb has a
rotation track on an unnamed second node.

The test reads the JSON chunk with the loader, never these constants, so the
expectations in suite.ddr were read back from the file this writes:
    python3 make_animation_fixture.py && python3 -c 'import json,struct;d=open("animated_triangle.glb","rb").read();n=struct.unpack_from("<I",d,12)[0];print(json.dumps(json.loads(d[20:20+n]),indent=1))'
"""
import json
import math
import struct
from pathlib import Path

positions = [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0]
translation = [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 2.0, 0.0, 0.0]
rotation = []
for degrees in (0, 30, 60, 90):
    half = math.radians(degrees) / 2
    rotation += [0.0, math.sin(half), 0.0, math.cos(half)]
scale = [1.0, 1.0, 1.0, 2.0, 2.0, 2.0]

bin_parts = [
    struct.pack("<9f", *positions),   # 0: POSITION, 3 x VEC3
    bytes([0, 1, 2]),                 # 1: indices
    struct.pack("<3f", 0.0, 1.0, 2.0),        # 2: translation input
    struct.pack("<9f", *translation),         # 3: translation output
    struct.pack("<4f", 0.0, 1.0, 2.0, 3.0),    # 4: rotation input
    struct.pack("<16f", *rotation),           # 5: rotation output
    struct.pack("<2f", 0.0, 1.5),             # 6: scale input
    struct.pack("<6f", *scale),               # 7: scale output
]
views = []
offset = 0
for part in bin_parts:
    views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(part)})
    offset += len(part)
binary = b"".join(bin_parts)


def scalar_input(view, count, maximum):
    # Animation input accessors carry their max (glTF 2.0 3.7.2.1: the clip's
    # duration is the largest of them); outputs are plain VEC3/VEC4.
    return {"bufferView": view, "componentType": 5126, "count": count, "type": "SCALAR", "max": [maximum]}


def document(rotation_interpolation="LINEAR", named_target=True):
    nodes = [{"mesh": 0, "name": "spinner"}]
    if not named_target:
        nodes.append({"mesh": 0})
    return {
        "asset": {"version": "2.0"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": nodes,
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0}, "indices": 1}]}],
        "animations": [{
            "name": "Turn",
            "samplers": [
                {"input": 2, "output": 3, "interpolation": "LINEAR"},
                {"input": 4, "output": 5, "interpolation": rotation_interpolation},
                {"input": 6, "output": 7, "interpolation": "STEP"},
            ],
            "channels": [
                {"sampler": 0, "target": {"node": 0, "path": "translation"}},
                {"sampler": 1, "target": {"node": 1 if not named_target else 0, "path": "rotation"}},
                {"sampler": 2, "target": {"node": 0, "path": "scale"}},
            ],
        }],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": 3, "type": "VEC3"},
            {"bufferView": 1, "componentType": 5121, "count": 3, "type": "SCALAR"},
            scalar_input(2, 3, 2.0),
            {"bufferView": 3, "componentType": 5126, "count": 3, "type": "VEC3"},
            scalar_input(4, 4, 3.0),
            {"bufferView": 5, "componentType": 5126, "count": 4, "type": "VEC4"},
            scalar_input(6, 2, 1.5),
            {"bufferView": 7, "componentType": 5126, "count": 2, "type": "VEC3"},
        ],
        "bufferViews": views,
        "buffers": [{"byteLength": len(padded)}],
    }


# glTF 2.0 §4.4.1: a chunk's length is a multiple of four. JSON is padded
# with spaces; BIN with zeros (0x00), which is what the other fixture writers
# get from a PNG whose length happens to land on four.
padded = binary + b"\x00" * (-len(binary) % 4)


def glb(doc) -> bytes:
    js = json.dumps(doc).encode("utf-8")
    js += b" " * (-len(js) % 4)
    return b"glTF" + struct.pack("<II", 2, 12 + 8 + len(js) + 8 + len(padded)) + struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(padded), 0x004E4942) + padded


Path("animated_triangle.glb").write_bytes(glb(document()))
Path("refused_spline_rotation.glb").write_bytes(glb(document("CUBICSPLINE")))
Path("refused_unnamed_target.glb").write_bytes(glb(document(named_target=False)))
print("wrote animated_triangle.glb, refused_spline_rotation.glb, refused_unnamed_target.glb")
