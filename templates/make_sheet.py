# Builds templates/YORIMICHI_管理シート.xlsx (standard library only).
# Upload it to Google Drive and open it with Google Sheets: the teacher / staff roster for the site and the world.
import zipfile
from xml.sax.saxutils import escape

SHEETS = []

def sheet(name, header, rows, widths, lists=None, note_col=None):
    SHEETS.append(dict(name=name, header=header, rows=rows, widths=widths, lists=lists or {}, note_col=note_col))

sheet("使い方", ["YORIMICHI 先生・運営スタッフ名簿"], [
    ["このシートは「先生」と「運営スタッフ」の名簿です。サイト本文や予定は、サイトの「編集」ボタンから編集します。"],
    ["・ここに書いた内容は15分ほどで、サイトの「教員・スタッフ紹介」と、VRChat ワールドの役職（教室の鍵・スタッフルームの名簿）に反映されます。"],
    ["・名前は VRChat の表示名と1文字も違わないように書いてください。"],
    ["・行を消すと、その人は先生・運営スタッフではなくなります。"],
    ["・1行目（色の付いた見出し）は消したり名前を変えたりしないでください。"],
    ["・韓国語の欄が空なら、韓国語ページには日本語が表示されます。"],
    ["・写真は Google ドライブに入れて「リンクを知っている全員」に共有し、そのリンクを「画像」の欄に貼ってください。"],
    ["・サイトに載せたくない人は「サイトに表示」を × にします（役職はそのまま使えます）。"],
    ["・このシートの編集権限は、かなさんのアカウントだけにしてください（一般的なアクセスは「閲覧者」のまま）。"],
    ["・このシートは誰でも見られる状態です。メールアドレスなどの個人情報や、応募フォームの回答は絶対に入れないでください。"],
], [110])

sheet("先生", ["VRChat表示名", "担当（日本語）", "担当（韓国語）", "紹介（日本語）", "紹介（韓国語）", "画像", "サイトに表示"], [
], [22, 18, 18, 46, 46, 30, 12], lists={6: ["○", "×"]})

sheet("運営スタッフ", ["VRChat表示名", "役割（日本語）", "役割（韓国語）", "紹介（日本語）", "紹介（韓国語）", "画像", "サイトに表示"], [
    ["かなさん", "創設者・管理者", "설립자·관리자", "YORIMICHI をつくっています。", "YORIMICHI를 만들고 있어요.", "", "○"],
], [22, 18, 18, 46, 46, 30, 12], lists={6: ["○", "×"]})


def col(n):
    s = ""
    n += 1
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def cell(ref, v, style):
    return f'<c r="{ref}" t="inlineStr" s="{style}"><is><t xml:space="preserve">{escape(str(v))}</t></is></c>'


def sheet_xml(sh):
    ncols = max(len(sh["header"]), max((len(r) for r in sh["rows"]), default=0))
    cols = "".join(f'<col min="{i+1}" max="{i+1}" width="{w}" customWidth="1"/>' for i, w in enumerate(sh["widths"]))
    rows = [f'<row r="1" ht="24" customHeight="1">' + "".join(cell(f"{col(i)}1", h, 1) for i, h in enumerate(sh["header"])) + "</row>"]
    for r, data in enumerate(sh["rows"], start=2):
        rows.append(f'<row r="{r}">' + "".join(cell(f"{col(i)}{r}", v, 2) for i, v in enumerate(data) if v != "") + "</row>")
    dv = ""
    if sh["lists"]:
        items = "".join(
            f'<dataValidation type="list" allowBlank="1" showDropDown="0" sqref="{col(c)}2:{col(c)}500"><formula1>"{",".join(v)}"</formula1></dataValidation>'
            for c, v in sh["lists"].items())
        dv = f'<dataValidations count="{len(sh["lists"])}">{items}</dataValidations>'
    freeze = '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' if sh["name"] != "使い方" else '<sheetViews><sheetView workbookViewId="0"/></sheetViews>'
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            f'{freeze}<sheetFormatPr defaultRowHeight="20"/><cols>{cols}</cols><sheetData>{"".join(rows)}</sheetData>{dv}</worksheet>')


STYLES = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
          '<fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts>'
          '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
          '<fill><patternFill patternType="solid"><fgColor rgb="FF3157FF"/><bgColor indexed="64"/></patternFill></fill></fills>'
          '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
          '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
          '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
          '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center"/></xf>'
          '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>'
          '</styleSheet>')

out = "templates/YORIMICHI_管理シート.xlsx"
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    n = len(SHEETS)
    z.writestr("[Content_Types].xml",
               '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
               '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
               '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
               '<Default Extension="xml" ContentType="application/xml"/>'
               '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
               '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
               + "".join(f'<Override PartName="/xl/worksheets/sheet{i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' for i in range(n))
               + "</Types>")
    z.writestr("_rels/.rels",
               '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
               '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
               '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
    z.writestr("xl/workbook.xml",
               '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
               '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
               + "".join(f'<sheet name="{escape(s["name"])}" sheetId="{i+1}" r:id="rId{i+1}"/>' for i, s in enumerate(SHEETS))
               + "</sheets></workbook>")
    z.writestr("xl/_rels/workbook.xml.rels",
               '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
               '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
               + "".join(f'<Relationship Id="rId{i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i+1}.xml"/>' for i in range(n))
               + f'<Relationship Id="rId{n+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>')
    z.writestr("xl/styles.xml", STYLES)
    for i, s in enumerate(SHEETS):
        z.writestr(f"xl/worksheets/sheet{i+1}.xml", sheet_xml(s))
print("wrote", out)
