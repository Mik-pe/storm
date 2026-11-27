#!/usr/bin/env python3
"""Writes occluded_triangle.glb: one triangle whose material has an
occlusionTexture (texture 0 -> image 0, a 2x2 (128, 200, 255) PNG) with a
strength of 0.6 and its own sampler (9729 magFilter, 33071 wrapS/T), and
refused_occlusion.glb, whose strength is 1.5: the loader must refuse it by
name (the spec says [0,1]).

The test reads the JSON chunk with the loader, never these constants, so the
expectations in suite.ddr were read back from the file this writes:
    python3 make_occlusion_fixture.py && python3 -c 'import json,struct;d=open("occluded_triangle.glb","rb").read();n=struct.unpack_from("<I",d,12)[0];print(json.dumps(json.loads(d[20:20+n]),indent=1))'
"""
import json
import struct
import zlib
from pathlib import Path


def png(red: int, green: int, blue: int) -> bytes:
    """A 2x2 opaque RGB PNG whose every pixel is (red, green, blue)."""
    def chunk(kind: bytes, body: bytes) -> bytes:
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", 2, 2, 8, 2, 0, 0, 0)
    rows = b"".join(b"\x00" + bytes([red, green, blue]) * 2 for _ in range(2))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b"")


mask_png = png(128, 200, 255)

positions = [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0]
uvs = [0.0, 0.0, 1.0, 0.0, 0.0, 1.0]
bin_parts = [struct.pack("<9f", *positions), struct.pack("<6f", *uvs), bytes([0, 1, 2])]
views = []
offset = 0
for part in bin_parts + [mask_png]:
    views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(part)})
    offset += len(part)
binary = b"".join(bin_parts) + mask_png


def document(strength):
    return {
        "asset": {"version": "2.0"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0, "TEXCOORD_0": 1}, "indices": 2, "material": 0}]}],
        "materials": [{
            "name": "helmet shell",
            "occlusionTexture": {"index": 0, "strength": strength, "texCoord": 0},
        }],
        "textures": [{"sampler": 0, "source": 0}],
        "samplers": [{"magFilter": 9729, "wrapS": 33071, "wrapT": 33071}],
        "images": [{"bufferView": 3, "mimeType": "image/png"}],
        "bufferViews": views,
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": 3, "type": "VEC3"},
            {"bufferView": 1, "componentType": 5126, "count": 3, "type": "VEC2"},
            {"bufferView": 2, "componentType": 5121, "count": 3, "type": "SCALAR"},
        ],
        "buffers": [{"byteLength": len(binary)}],
    }


def glb(doc) -> bytes:
    js = json.dumps(doc).encode("utf-8")
    js += b" " * (-len(js) % 4)
    return b"glTF" + struct.pack("<II", 2, 12 + 8 + len(js) + 8 + len(binary)) + struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(binary), 0x004E4942) + binary


Path("occluded_triangle.glb").write_bytes(glb(document(0.6)))
Path("refused_occlusion.glb").write_bytes(glb(document(1.5)))
print("wrote occluded_triangle.glb and refused_occlusion.glb")
