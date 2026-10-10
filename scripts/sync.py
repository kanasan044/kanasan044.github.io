"""Reads the YORIMICHI management sheet (teachers and staff only) and writes:

  data/people.js   - teacher / staff cards for the 教員・スタッフ紹介 page
  roster.json      - teacher / staff names for the VRChat world (YorimichiRoles reads it)
  images/uploads/* - profile pictures given as Google Drive links

Everything else on the site is edited inside the site (assets/js/admin.js -> data/content.js).
Runs on GitHub Actions (.github/workflows/sync.yml) with the SHEET_ID variable, or locally:
  python scripts/sync.py path/to/sheet.xlsx
The sheet must be shared as "anyone with the link can view" (editing stays owner-only). Standard library only.
"""
import datetime as dt
import io
import json
import os
import re
import sys
import urllib.request
import zipfile
import xml.etree.ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}

COLS = {
    "先生": {"VRChat表示名": "name", "担当（日本語）": "lang_ja", "担当（韓国語）": "lang_ko", "紹介（日本語）": "bio_ja", "紹介（韓国語）": "bio_ko", "画像": "image", "サイトに表示": "show"},
    "運営スタッフ": {"VRChat表示名": "name", "役割（日本語）": "role_ja", "役割（韓国語）": "role_ko", "紹介（日本語）": "bio_ja", "紹介（韓国語）": "bio_ko", "画像": "image", "サイトに表示": "show"},
}


def norm(s):
    """'紹介(日本語)' == '紹介（日本語）', spaces ignored."""
    return re.sub(r"\s+", "", str(s or "")).replace("(", "（").replace(")", "）")


def read_xlsx(data):
    """{sheet name: [[cell, ...], ...]} with every cell as text."""
    z = zipfile.ZipFile(io.BytesIO(data))
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
            shared.append("".join(t.text or "" for t in si.iter("{%s}t" % NS["m"])))
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
    out = {}
    for s in wb.find("m:sheets", NS):
        target = rels[s.get("{%s}id" % NS["r"])].lstrip("/")
        path = target if target.startswith("xl/") else "xl/" + target
        rows = []
        for row in ET.fromstring(z.read(path)).iter("{%s}row" % NS["m"]):
            cells = {}
            for c in row.findall("m:c", NS):
                idx = 0
                for ch in re.match(r"([A-Z]+)", c.get("r")).group(1):
                    idx = idx * 26 + ord(ch) - 64
                t, v = c.get("t"), c.find("m:v", NS)
                if t == "s":
                    val = shared[int(v.text)] if v is not None else ""
                elif t == "inlineStr":
                    val = "".join(x.text or "" for x in c.iter("{%s}t" % NS["m"]))
                else:
                    val = v.text if v is not None else ""
                cells[idx - 1] = val
            if cells:
                rows.append([cells.get(i, "") for i in range(max(cells) + 1)])
        out[s.get("name")] = rows
    return out


def records(rows, cols):
    if not rows:
        return []
    m = {norm(k): v for k, v in cols.items()}
    keys = [m.get(norm(h)) for h in rows[0]]
    out = []
    for r in rows[1:]:
        o = {k: str(r[i]).strip() if i < len(r) else "" for i, k in enumerate(keys) if k}
        if any(o.values()):
            out.append(o)
    return out


def is_off(v):
    return bool(re.fullmatch(r"(×|✕|x|no|false|いいえ|非表示|0)", str(v or "").strip(), re.I))


def image(v):
    """Google Drive share link -> downloaded into images/uploads; https URL or file name -> as is."""
    v = str(v or "").strip()
    if not v:
        return ""
    m = re.search(r"drive\.google\.com/(?:file/d/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]{10,})", v)
    if not m:
        return v if re.match(r"https?://", v) or "/" in v else "images/" + v
    fid = m.group(1)
    os.makedirs("images/uploads", exist_ok=True)
    for ext in ("jpg", "png", "webp", "gif"):
        if os.path.exists(f"images/uploads/{fid}.{ext}"):
            return f"images/uploads/{fid}.{ext}"
    try:
        with urllib.request.urlopen(f"https://drive.google.com/uc?export=download&id={fid}", timeout=60) as res:
            ctype = res.headers.get("content-type", "")
            if not ctype.startswith("image/"):
                raise ValueError(ctype)
            ext = "png" if "png" in ctype else "webp" if "webp" in ctype else "gif" if "gif" in ctype else "jpg"
            path = f"images/uploads/{fid}.{ext}"
            with open(path, "wb") as f:
                f.write(res.read())
            print("downloaded", path)
            return path
    except Exception as e:  # noqa: BLE001 - keep going; the card falls back to the initial
        print(f"image {fid}: could not download ({e}); share it as 'anyone with the link'")
        return ""


def put(path, content):
    """Write only when something other than the timestamp changed."""
    strip = lambda s: re.sub(r'"updated": "[^"]*"', "", s)  # noqa: E731
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            if strip(f.read()) == strip(content):
                return False
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)
    print("wrote", path)
    return True


def main():
    if len(sys.argv) > 1:
        with open(sys.argv[1], "rb") as f:
            data = f.read()
    else:
        sid = os.environ.get("SHEET_ID", "").strip()
        if not sid:
            sys.exit("SHEET_ID is not set")
        with urllib.request.urlopen(f"https://docs.google.com/spreadsheets/d/{sid}/export?format=xlsx", timeout=60) as res:
            data = res.read()
        if not data.startswith(b"PK"):
            sys.exit('could not read the sheet: is it shared as "anyone with the link can view"?')
    book = read_xlsx(data)

    def people(name):
        rows = book.get(name) or next((v for k, v in book.items() if norm(k) == norm(name)), [])
        return [dict(p, image=image(p.get("image")), show=not is_off(p.get("show"))) for p in records(rows, COLS[name]) if p.get("name")]

    teachers, staff = people("先生"), people("運営スタッフ")
    updated = dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).strftime("%Y-%m-%d %H:%M")
    put("data/people.js", "/* 管理シート（先生・運営スタッフ）から自動で作られるファイルです。手で書き換えないでください。 */\nwindow.YORIMICHI_PEOPLE = "
        + json.dumps({"updated": updated, "teachers": teachers, "staff": staff}, ensure_ascii=False, indent=2) + ";\n")
    put("roster.json", json.dumps({"updated": updated, "teachers": [p["name"] for p in teachers], "staff": [p["name"] for p in staff]},
                                  ensure_ascii=False, indent=2) + "\n")
    print(f"ok: {len(teachers)} teachers, {len(staff)} staff")


if __name__ == "__main__":
    main()
