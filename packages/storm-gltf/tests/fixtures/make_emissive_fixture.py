#!/usr/bin/env python3
"""Writes emissive_triangle.glb: one triangle whose material has an emissive
texture (a 2x2 PNG), an emissiveFactor of three components that stand out
(0.5, 0.25, 1.0) and KHR_materials_emissive_strength (3.5), listed in
extensionsUsed but not in extensionsRequired.

The test reads the JSON chunk with the loader, never these constants, so the
expectations in suite.ddr were read back from the file this writes:
    python3 make_emissive_fixture.py && python3 -c 'import json,struct;d=open("emissive_triangle.glb","rb").read();n=struct.unpack_from("<I",d,12)[0];print(json.dumps(json.loads(d[20:20+n]),indent=1))'

Then a second file, refused_emissive.glb, whose emissiveFactor has four
components: the loader must refuse it by name (the spec says three). And a
third, factor_without_map.glb: an emissiveFactor and a strength but no
emissiveTexture -- the factor is kept, the map is absent.
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


glow_png = png(249, 255, 175)

positions = [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0]
uvs = [0.0, 0.0, 1.0, 0.0, 0.0, 1.0]
bin_parts = [struct.pack("<9f", *positions), struct.pack("<6f", *uvs), bytes([0, 1, 2])]
views = []
offset = 0
for part in bin_parts + [glow_png]:
    views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(part)})
    offset += len(part)
binary = b"".join(bin_parts) + glow_png


def material(emissive_factor, with_map=True):
    m = {
        "name": "lantern glass",
        "emissiveFactor": emissive_factor,
        "extensions": {"KHR_materials_emissive_strength": {"emissiveStrength": 3.5}},
    }
    if with_map:
        m["emissiveTexture"] = {"index": 0}
    return m


def document(emissive_factor, with_map=True):
    return {
        "asset": {"version": "2.0"},
        "extensionsUsed": ["KHR_materials_emissive_strength"],
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0, "TEXCOORD_0": 1}, "indices": 2, "material": 0}]}],
        "materials": [material(emissive_factor, with_map)],
        "textures": [{"source": 0}],
        "images": [{"bufferView": 3, "mimeType": "image/png"}],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": 3, "type": "VEC3"},
            {"bufferView": 1, "componentType": 5126, "count": 3, "type": "VEC2"},
            {"bufferView": 2, "componentType": 5121, "count": 3, "type": "SCALAR"},
        ],
        "bufferViews": views,
        "buffers": [{"byteLength": len(binary)}],
    }


def write(name: str, doc) -> None:
    json_bytes = json.dumps(doc, separators=(",", ":")).encode("utf-8")
    json_bytes += b" " * ((4 - len(json_bytes) % 4) % 4)
    binary_bytes = binary + b"\x00" * ((4 - len(binary) % 4) % 4)
    total = 12 + 8 + len(json_bytes) + 8 + len(binary_bytes)
    data = struct.pack("<III", 0x46546C67, 2, total)
    data += struct.pack("<II", len(json_bytes), 0x4E4F534A) + json_bytes
    data += struct.pack("<II", len(binary_bytes), 0x004E4942) + binary_bytes
    Path(__file__).with_name(name).write_bytes(data)


write("emissive_triangle.glb", document([0.5, 0.25, 1.0]))
write("refused_emissive.glb", document([0.5, 0.25, 1.0, 1.0]))
write("factor_without_map.glb", document([0.5, 0.25, 1.0], with_map=False))
