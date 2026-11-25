#!/usr/bin/env python3
"""Writes mapped_triangle.glb: one triangle whose material has a base colour
texture and a metallic-roughness texture, two different 2x2 PNG images, one
sampler with numbers that stand out (9728 NEAREST, 33071 CLAMP_TO_EDGE).

The test reads the JSON chunk with the loader, never these constants, so the
expectations in suite.ddr were read back from the file this writes:
    python3 make_mapped_fixture.py && python3 -c 'import json,struct;d=open("mapped_triangle.glb","rb").read();n=struct.unpack_from("<I",d,12)[0];print(json.dumps(json.loads(d[20:20+n]),indent=1))'
"""
import json
import struct
import zlib
from pathlib import Path


def png(red: int, green: int) -> bytes:
    """A 2x2 opaque RGB PNG whose every pixel is (red, green, 0)."""
    def chunk(kind: bytes, body: bytes) -> bytes:
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", 2, 2, 8, 2, 0, 0, 0)
    rows = b"".join(b"\x00" + bytes([red, green, 0]) * 2 for _ in range(2))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b"")


base_png = png(200, 40)
rough_png = png(0, 160)

# Three positions (VEC3 float), three uv (VEC2 float), three indices (u8).
positions = [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0]
uvs = [0.0, 0.0, 1.0, 0.0, 0.0, 1.0]
bin_parts = [struct.pack("<9f", *positions), struct.pack("<6f", *uvs), bytes([0, 1, 2])]
views = []
offset = 0
for part in bin_parts:
    views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(part)})
    offset += len(part)
for image in (base_png, rough_png):
    views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(image)})
    offset += len(image)
binary = b"".join(bin_parts) + base_png + rough_png

doc = {
    "asset": {"version": "2.0"},
    "scene": 0,
    "scenes": [{"nodes": [0]}],
    "nodes": [{"mesh": 0}],
    "meshes": [{"primitives": [{"attributes": {"POSITION": 0, "TEXCOORD_0": 1}, "indices": 2, "material": 0}]}],
    "materials": [{
        "name": "painted",
        "pbrMetallicRoughness": {
            "baseColorTexture": {"index": 0},
            "metallicFactor": 0.5,
            "roughnessFactor": 0.25,
            "metallicRoughnessTexture": {"index": 1},
        },
    }],
    "textures": [{"source": 0, "sampler": 0}, {"source": 1}],
    "samplers": [{"magFilter": 9728, "minFilter": 9728, "wrapS": 33071, "wrapT": 33071}],
    "images": [{"bufferView": 3, "mimeType": "image/png"}, {"bufferView": 4, "mimeType": "image/png"}],
    "accessors": [
        {"bufferView": 0, "componentType": 5126, "count": 3, "type": "VEC3"},
        {"bufferView": 1, "componentType": 5126, "count": 3, "type": "VEC2"},
        {"bufferView": 2, "componentType": 5121, "count": 3, "type": "SCALAR"},
    ],
    "bufferViews": views,
    "buffers": [{"byteLength": len(binary)}],
}
json_bytes = json.dumps(doc, separators=(",", ":")).encode("utf-8")
json_bytes += b" " * ((4 - len(json_bytes) % 4) % 4)
binary += b"\x00" * ((4 - len(binary) % 4) % 4)

total = 12 + 8 + len(json_bytes) + 8 + len(binary)
out = Path(__file__).with_name("mapped_triangle.glb")
out.write_bytes(
    struct.pack("<III", 0x46546C67, 2, total)
    + struct.pack("<II", len(json_bytes), 0x4E4F534A) + json_bytes
    + struct.pack("<II", len(binary), 0x004E4942) + binary
)
print(f"{out} {out.stat().st_size} bytes; base png {len(base_png)}, rough png {len(rough_png)}")
