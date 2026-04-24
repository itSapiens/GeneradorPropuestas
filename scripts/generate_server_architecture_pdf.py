from __future__ import annotations

from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    Paragraph,
    Preformatted,
    SimpleDocTemplate,
    Spacer,
)


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "server-architecture-explanation.md"
OUTPUT = ROOT / "docs" / "server-architecture-explanation.pdf"


def build_styles():
    styles = getSampleStyleSheet()

    styles.add(
        ParagraphStyle(
            name="DocTitle",
            parent=styles["Title"],
            fontName="Helvetica-Bold",
            fontSize=22,
            leading=28,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#0B1F3A"),
            spaceAfter=14,
        )
    )
    styles.add(
        ParagraphStyle(
            name="DocSubtitle",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=10,
            leading=14,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#4A5568"),
            spaceAfter=18,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Heading1Custom",
            parent=styles["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=16,
            leading=20,
            textColor=colors.HexColor("#0B1F3A"),
            spaceBefore=10,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Heading2Custom",
            parent=styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=12,
            leading=16,
            textColor=colors.HexColor("#123B6D"),
            spaceBefore=8,
            spaceAfter=6,
        )
    )
    styles.add(
        ParagraphStyle(
            name="BodyCustom",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=9.5,
            leading=13.5,
            alignment=TA_JUSTIFY,
            textColor=colors.HexColor("#1F2937"),
            spaceAfter=5,
        )
    )
    styles.add(
        ParagraphStyle(
            name="BulletCustom",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=9.5,
            leading=13.5,
            leftIndent=12,
            firstLineIndent=-8,
            bulletIndent=0,
            textColor=colors.HexColor("#1F2937"),
            spaceAfter=3,
        )
    )
    styles.add(
        ParagraphStyle(
            name="CodeLabel",
            parent=styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=9,
            leading=12,
            textColor=colors.HexColor("#123B6D"),
            spaceBefore=5,
            spaceAfter=4,
        )
    )

    return styles


def draw_header_footer(canvas, doc):
    canvas.saveState()
    width, height = A4

    canvas.setStrokeColor(colors.HexColor("#D7E3F4"))
    canvas.setLineWidth(0.6)
    canvas.line(doc.leftMargin, height - 1.4 * cm, width - doc.rightMargin, height - 1.4 * cm)

    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#64748B"))
    canvas.drawString(doc.leftMargin, 1.0 * cm, "calcSap - Arquitectura del servidor")
    canvas.drawRightString(width - doc.rightMargin, 1.0 * cm, f"Pagina {doc.page}")
    canvas.restoreState()


def parse_markdown(markdown: str, styles):
    story = []
    paragraph_buffer: list[str] = []
    in_code_block = False
    code_lines: list[str] = []

    def flush_paragraph():
        nonlocal paragraph_buffer
        if not paragraph_buffer:
            return

        text = " ".join(part.strip() for part in paragraph_buffer if part.strip())
        if text:
            story.append(Paragraph(escape(text), styles["BodyCustom"]))
        paragraph_buffer = []

    def flush_code():
        nonlocal code_lines
        if not code_lines:
            return
        story.append(Paragraph("Estructura de carpetas", styles["CodeLabel"]))
        story.append(
            Preformatted(
                "\n".join(code_lines),
                style=ParagraphStyle(
                    "CodeBlock",
                    fontName="Courier",
                    fontSize=8,
                    leading=10,
                    leftIndent=10,
                    rightIndent=8,
                    borderPadding=8,
                    borderWidth=0.6,
                    borderColor=colors.HexColor("#D7E3F4"),
                    backColor=colors.HexColor("#F8FAFC"),
                    textColor=colors.HexColor("#0F172A"),
                    spaceAfter=8,
                ),
            )
        )
        code_lines = []

    lines = markdown.splitlines()
    title_drawn = False

    for raw_line in lines:
        line = raw_line.rstrip("\n")
        stripped = line.strip()

        if stripped.startswith("```"):
            flush_paragraph()
            if in_code_block:
                flush_code()
                in_code_block = False
            else:
                in_code_block = True
            continue

        if in_code_block:
            code_lines.append(line)
            continue

        if not stripped:
            flush_paragraph()
            continue

        if stripped.startswith("# "):
            flush_paragraph()
            if not title_drawn:
              story.append(Paragraph(escape(stripped[2:].strip()), styles["DocTitle"]))
              title_drawn = True
            else:
              story.append(Paragraph(escape(stripped[2:].strip()), styles["Heading1Custom"]))
            continue

        if stripped.lower().startswith("fecha:"):
            flush_paragraph()
            story.append(Paragraph(escape(stripped), styles["DocSubtitle"]))
            story.append(Spacer(1, 0.15 * cm))
            continue

        if stripped.startswith("## "):
            flush_paragraph()
            story.append(Spacer(1, 0.1 * cm))
            story.append(Paragraph(escape(stripped[3:].strip()), styles["Heading1Custom"]))
            continue

        if stripped.startswith("### "):
            flush_paragraph()
            story.append(Paragraph(escape(stripped[4:].strip()), styles["Heading2Custom"]))
            continue

        if stripped.startswith("- "):
            flush_paragraph()
            bullet_text = escape(stripped[2:].strip())
            story.append(Paragraph(bullet_text, styles["BulletCustom"], bulletText="•"))
            continue

        if stripped[0].isdigit() and ". " in stripped[:4]:
            flush_paragraph()
            number, text = stripped.split(". ", 1)
            story.append(
                Paragraph(
                    escape(text.strip()),
                    styles["BulletCustom"],
                    bulletText=f"{number}.",
                )
            )
            continue

        paragraph_buffer.append(stripped)

    flush_paragraph()
    flush_code()
    return story


def main():
    if not SOURCE.exists():
        raise SystemExit(f"No se ha encontrado el fichero fuente: {SOURCE}")

    markdown = SOURCE.read_text(encoding="utf-8")
    styles = build_styles()
    story = parse_markdown(markdown, styles)

    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        leftMargin=1.8 * cm,
        rightMargin=1.8 * cm,
        topMargin=2.0 * cm,
        bottomMargin=1.7 * cm,
        title="Nueva estructura del servidor",
        author="Codex",
    )

    doc.build(story, onFirstPage=draw_header_footer, onLaterPages=draw_header_footer)
    print(OUTPUT)


if __name__ == "__main__":
    main()
