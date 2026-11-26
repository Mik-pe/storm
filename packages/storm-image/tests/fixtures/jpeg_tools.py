"""Measure what a JPEG asks of a decoder — the tools behind docs/next-steps.md's
progressive-JPEG entry. Read-only: nothing here writes into the repo.

    python3 jpeg_tools.py scans   image.jpg [...]      # markers: SOF, sampling, per-scan Ss/Se/Ah/Al
    python3 jpeg_tools.py census  image.jpg [...]      # per scan: which Huffman symbols/paths are used
    python3 jpeg_tools.py glb     dir/                 # every JPEG inside the .glb files of a directory
    python3 jpeg_tools.py trunc   image.jpg            # decode cut after each scan + EOI, diff vs full

A fixture is evidence only for the paths it exercises: progressive16.jpg has
the full ten-scan structure but every AC scan is a single EOB symbol, so a
decoder that writes no AC coefficient at all passes on it. `census` is how a
new fixture is checked before it is trusted. Requires Pillow for `trunc`.
"""
import glob
import io
import json
import os
import struct
import sys
from collections import Counter

SOF_MARKERS = (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF)
NAMES = {0xC0: "SOF0", 0xC1: "SOF1", 0xC2: "SOF2", 0xC3: "SOF3", 0xC4: "DHT", 0xC8: "JPG",
         0xCC: "DAC", 0xD9: "EOI", 0xDA: "SOS", 0xDB: "DQT", 0xDC: "DNL", 0xDD: "DRI"}
# The order every libjpeg encoder writes by default (jcparam.c jpeg_simple_progression).
SIMPLE_PROGRESSION = [
    # (Ss, Se, Ah, Al, components)
    (0, 0, 0, 1, "all"), (1, 5, 0, 2, "Y"), (6, 63, 0, 2, "Y"),
    (1, 63, 0, 1, "Cb"), (1, 63, 0, 1, "Cr"),
    (1, 63, 2, 1, "Y"), (1, 63, 1, 0, "Cb"), (1, 63, 1, 0, "Cr"),
    (0, 0, 1, 0, "all"), (1, 63, 1, 0, "Y"),
]


class Scan:
    def __init__(self, comps, ss, se, ah, al, data_at, data_len):
        self.comps = comps  # [(component id, dc table, ac table)]
        self.ss, self.se, self.ah, self.al = ss, se, ah, al
        self.data_at, self.data_len = data_at, data_len

    def __repr__(self):
        return "Ss=%2d Se=%2d Ah=%d Al=%d comps=%s" % (
            self.ss, self.se, self.ah, self.al, [c[0] for c in self.comps])


class Jpeg:
    """Markers of one baseline or progressive file, enough to plan a decode."""

    def __init__(self, data):
        self.data = data
        assert data[:2] == b"\xff\xd8", "not a JPEG"
        self.process = None
        self.width = self.height = 0
        self.components = []  # [(id, h, v, qtable)]
        self.restart_interval = 0
        self.scans = []
        self.dc_tables = {}  # (scan index, table id) -> (counts[16], symbols)
        self.ac_tables = {}
        at = 2
        scan_index = -1
        while at + 4 <= len(data):
            if data[at] != 0xFF:
                break
            m = data[at + 1]
            if m == 0xFF:
                at += 1
                continue
            if m == 0xD9:
                break
            if 0xD0 <= m <= 0xD7:
                at += 2
                continue
            seglen = struct.unpack_from(">H", data, at + 2)[0]
            body = at + 4
            if m in SOF_MARKERS:
                p, h, w, n = struct.unpack_from(">BHHB", data, body)
                self.process = {0xC0: "baseline", 0xC1: "extended", 0xC2: "progressive", 0xC3: "lossless"}.get(m, hex(m))
                self.width, self.height = w, h
                self.components = [(data[body + 6 + c * 3], data[body + 7 + c * 3] >> 4,
                                    data[body + 7 + c * 3] & 15, data[body + 8 + c * 3]) for c in range(n)]
            elif m == 0xDD:
                self.restart_interval = struct.unpack_from(">H", data, body)[0]
            elif m == 0xC4:
                p = body
                while p < body + seglen - 2:
                    tc, th = data[p] >> 4, data[p] & 15
                    counts = list(data[p + 1:p + 17])
                    symbols = list(data[p + 17:p + 17 + sum(counts)])
                    table = (counts, symbols)
                    (self.dc_tables if tc == 0 else self.ac_tables)[(scan_index + 1, th)] = table
                    p += 17 + sum(counts)
            elif m == 0xDA:
                scan_index += 1
                ns = data[body]
                comps = [(data[body + 1 + c * 2], data[body + 2 + c * 2] >> 4, data[body + 2 + c * 2] & 15)
                         for c in range(ns)]
                ss, se, ahal = struct.unpack_from(">BBB", data, body + 1 + ns * 2)
                start = at + 2 + seglen
                p = start
                while p + 1 < len(data):
                    if data[p] == 0xFF and data[p + 1] != 0x00 and not 0xD0 <= data[p + 1] <= 0xD7:
                        break
                    p += 1
                self.scans.append(Scan(comps, ss, se, ahal >> 4, ahal & 15, start, p - start))
                at = p
                continue
            at += 2 + seglen

    def mcu_geometry(self):
        hmax = max(c[1] for c in self.components)
        vmax = max(c[2] for c in self.components)
        mcus_x = (self.width + 8 * hmax - 1) // (8 * hmax)
        mcus_y = (self.height + 8 * vmax - 1) // (8 * vmax)
        return hmax, vmax, mcus_x * mcus_y


def cmd_scans(paths):
    for path in paths:
        j = Jpeg(open(path, "rb").read())
        hmax, vmax, mcus = j.mcu_geometry()
        print("%s: %s %dx%d %d:%d comps=%s MCUs=%d DRI=%d scans=%d" % (
            os.path.basename(path), j.process, j.width, j.height, hmax, vmax,
            [(c[0], c[1], c[2]) for c in j.components], mcus, j.restart_interval, len(j.scans)))
        for n, s in enumerate(j.scans, 1):
            kind = ("DC" if s.se == 0 else "AC") + ("ref " if s.ah else "first")
            print("  scan %2d %s %s  %d entropy bytes" % (n, kind, s, s.data_len))


def glb_images(path):
    data = open(path, "rb").read()
    magic, _, length = struct.unpack_from("<III", data, 0)
    assert magic == 0x46546C67, "not a GLB"
    at, doc, bin_ = 12, None, None
    while at < length:
        clen, ctype = struct.unpack_from("<II", data, at)
        if ctype == 0x4E4F534A:
            doc = json.loads(data[at + 8:at + 8 + clen])
        elif ctype == 0x004E4942:
            bin_ = data[at + 8:at + 8 + clen]
        at += 8 + clen
    views = doc["bufferViews"]
    out = []
    for i, img in enumerate(doc.get("images", [])):
        view = views[img["bufferView"]]
        start = view.get("byteOffset", 0)
        out.append((i, bin_[start:start + view["byteLength"]]))
    return out


def cmd_glb(directory):
    files = sorted(glob.glob(os.path.join(directory, "*.glb")))
    rows = []
    for g in files:
        for i, data in glb_images(g):
            if data[:2] != b"\xff\xd8":
                continue
            j = Jpeg(data)
            hmax, vmax, mcus = j.mcu_geometry()
            rows.append((os.path.basename(g), i, j.process, j.width, j.height, "%d:%d" % (hmax, vmax),
                         len(j.scans), j.restart_interval, len(data)))
    print("glb files: %d | jpeg images: %d | progressive: %s" % (
        len(files), len(rows), ["%s image%d" % (r[0], r[1]) for r in rows if r[2] == "progressive"]))
    print("with restart intervals: %s" % ["%s image%d" % (r[0], r[1]) for r in rows if r[7]])
    for r in rows:
        print("  %-22s image%-2d %-11s %dx%d %s scans=%d DRI=%d %d B" % r)


class Bits:
    """T.81 F.2.2.5 bit reader: byte-stuffed FF00 skipped, FF D0-D7 = RSTn reported."""

    def __init__(self, data, at, end):
        self.data, self.at, self.end, self.pos = data, at, end, 0
        self.restart = None
        self.count = 0  # bits handed out

    def read(self):
        if self.restart is not None:
            return 1
        if self.at >= self.end:
            self.restart = "EOF"
            return 1  # pad with ones, as libjpeg does at the end of a scan
        byte = self.data[self.at]
        if byte == 0xFF and self.pos == 0:
            nxt = self.data[self.at + 1] if self.at + 1 < self.end else 0xD9
            if nxt != 0x00 and 0xD0 <= nxt <= 0xD7:
                self.restart = "RST%d" % (nxt - 0xD0)
                self.at += 2
                return 1
            if nxt != 0x00:
                self.restart = "marker"  # next marker: scan data ended
                return 1
            # FF 00: FF is data (eight bits); the 00 is stuffing, skipped once FF is consumed.
        bit = (byte >> (7 - self.pos)) & 1
        self.count += 1
        self.pos += 1
        if self.pos == 8:
            self.pos = 0
            self.at += 2 if byte == 0xFF else 1
        return bit

    def take(self, n):
        v = 0
        for _ in range(n):
            v = (v << 1) | self.read()
        return v


class Huffman:
    """T.81 F.2.2.3 canonical lookup: mincode[l], valptr[l]."""

    def __init__(self, counts, symbols):
        self.code = [0] * 17
        self.mincode = [0] * 17
        self.valptr = [0] * 17
        code, p = 0, 0
        for length in range(1, 17):
            self.mincode[length] = code
            self.valptr[length] = p
            p += counts[length - 1]
            code = (code + counts[length - 1]) << 1
        self.symbols, self.counts = symbols, counts

    def decode(self, bits):
        code = 0
        for length in range(1, 17):
            code = (code << 1) | bits.read()
            if code - self.mincode[length] < self.counts[length - 1]:
                return self.symbols[self.valptr[length] + code - self.mincode[length]]
        raise ValueError("bad huffman code at bit position %d" % bits.at)


def _latest(j, scan_index, table_id, ac):
    tables = j.ac_tables if ac else j.dc_tables
    best = None
    for (idx, tid), t in tables.items():
        if tid == table_id and idx <= scan_index and (best is None or idx > best[0]):
            best = (idx, t)
    if best is None:
        raise KeyError("no %s table %d before scan %d" % ("AC" if ac else "DC", table_id, scan_index))
    return best[1]


def cmd_census(paths):
    """Walk every scan's entropy data with the right procedure and count paths.

    DC scans are complete. AC-first is complete. AC-refine needs the coefficient
    array to know where the already-nonzero coefficients are; this walk does not
    keep one, so it reads one symbol per block and the row is marked partial —
    the counts are a lower bound over roughly the first fifth of the scan.
    A baseline file is one scan (Ss=0, Se=63, Ah=0) and shows as AC1st: only its
    AC symbols are counted, the DC differences are not.
    """
    for path in paths:
        j = Jpeg(open(path, "rb").read())
        hmax, vmax, mcus = j.mcu_geometry()
        print("##### %s  %s %dx%d MCUs=%d" % (os.path.basename(path), j.process, j.width, j.height, mcus))
        for n, s in enumerate(j.scans):
            comps = [c for c in j.components if c[0] in [x[0] for x in s.comps]]
            # blocks per MCU for this scan's components, in scan order
            per_mcu = sum(c[1] * c[2] for c in comps)
            if len(s.comps) == 1:
                c = comps[0]
                blocks = mcus * c[1] * c[2]
                mcus_in_scan = blocks
            else:
                blocks = mcus * per_mcu
                mcus_in_scan = mcus
            bits = Bits(j.data, s.data_at, s.data_at + s.data_len)
            symbols = Counter()
            cats = Counter()
            zrl = eob_symbols = 0
            partial = False
            eobrun = 0
            try:
                if s.se == 0 and s.ah == 0:  # DC first
                    for _ in range(mcus_in_scan):
                        for cid, td, ta in s.comps:
                            table = Huffman(*_latest(j, n, td, False))
                            for _b in range(_factor(j, cid)):
                                s_ = table.decode(bits)
                                cats[s_] += 1
                                if s_:
                                    _ = bits.take(s_)
                elif s.se == 0:  # DC refine: one correction bit per block
                    for _ in range(mcus_in_scan):
                        for cid, _, _ in s.comps:
                            for _b in range(_factor(j, cid)):
                                _ = bits.read()
                elif s.ah == 0:  # AC first
                    for _ in range(blocks):
                        k = s.ss
                        if eobrun > 0:
                            eobrun -= 1
                            continue
                        while k <= s.se:
                            rs = Huffman(*_latest(j, n, s.comps[0][2], True)).decode(bits)
                            symbols[rs] += 1
                            r, sz = rs >> 4, rs & 15
                            if sz == 0:
                                if r == 15:
                                    zrl += 1
                                    k += 16
                                    continue
                                eob_symbols += 1
                                eobrun = (1 << r) + (bits.take(r) if r else 0) - 1
                                break
                            k += r
                            _ = bits.take(sz)
                            k += 1
                else:  # AC refine: partial — one symbol per block, then skip
                    partial = True
                    for _ in range(blocks):
                        if eobrun > 0:
                            eobrun -= 1
                            continue
                        rs = Huffman(*_latest(j, n, s.comps[0][2], True)).decode(bits)
                        symbols[rs] += 1
                        r, sz = rs >> 4, rs & 15
                        if sz == 0 and r < 15:
                            eob_symbols += 1
                            eobrun = (1 << r) + (bits.take(r) if r else 0)  # refine: no "-1"
                        elif sz == 0:
                            zrl += 1
            except ValueError as e:
                # Padding ones at the end of the last byte can decode to no code: that is the
                # scan's end, not a corrupt file. Anything earlier is reported.
                if bits.at < s.data_at + s.data_len - 1:
                    print("  scan %2d: %s (scan is %d bytes)" % (n + 1, e, s.data_len))
            consumed = bits.count
            top = ",".join("R%dS%d×%d" % (k >> 4, k & 15, v) for k, v in symbols.most_common(5))
            cat = ",".join("%d×%d" % (k, v) for k, v in sorted(cats.items())[:8])
            kind = ("DC" if s.se == 0 else "AC") + ("1st" if s.ah == 0 else "ref")
            print("  %s Ss=%2d Se=%2d Al=%d blocks=%6d bits=%7d/%7d ZRL=%4d EOBr=%5d%s  %s %s" % (
                kind, s.ss, s.se, s.al, blocks, consumed, s.data_len * 8, zrl, eob_symbols,
                " [partial]" if partial else "", cat, top))


def _factor(j, comp_id):
    for c in j.components:
        if c[0] == comp_id:
            return c[1] * c[2]
    raise KeyError(comp_id)


def cmd_trunc(path):
    from PIL import Image

    full = Image.open(path).convert("RGB")
    base = full.tobytes()
    data = open(path, "rb").read()
    j = Jpeg(data)
    print("%s: %dx%d scans=%d" % (os.path.basename(path), j.width, j.height, len(j.scans)))
    for n, s in enumerate(j.scans, 1):
        end = s.data_at + s.data_len
        part = data[:end] + b"\xff\xd9"
        try:
            im = Image.open(io.BytesIO(part))
            im.load()
            px = im.convert("RGB").tobytes()
        except Exception as e:  # noqa: BLE001
            print("after scan %2d (%8d B): FAILED %s" % (n, end, e))
            continue
        diff = sum(abs(a - b) for a, b in zip(px, base)) / len(base)
        print("after scan %2d (%8d B): mean |diff| vs full = %.3f" % (n, end, diff))


def main(argv):
    if len(argv) < 2 or argv[1] not in ("scans", "census", "glb", "trunc") or len(argv) < 3:
        print(__doc__)
        return 2
    cmd = {"scans": cmd_scans, "census": cmd_census, "glb": cmd_glb, "trunc": cmd_trunc}[argv[1]]
    if argv[1] == "glb":
        cmd(argv[2])
    elif argv[1] == "trunc":
        for p in argv[2:]:
            cmd(p)
    else:
        cmd(argv[2:])
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
