"""
PDF Research Report Generator using ReportLab.
Generates institutional-quality quantitative summary sheets.
"""

import io
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


def generate_experiment_pdf(experiment_data: dict[str, Any]) -> bytes:
    """
    Generates a structured PDF research sheet from experiment results.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=36,
    )

    styles = getSampleStyleSheet()

    # Custom palette colors
    c_sapphire = colors.HexColor("#063154")
    c_blue_lagoon = colors.HexColor("#025F67")
    c_heather = colors.HexColor("#BCC5CC")
    c_surface = colors.HexColor("#FCFBF8")
    c_dark_text = colors.HexColor("#1A2B35")

    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=20,
        leading=24,
        textColor=c_sapphire,
    )
    subtitle_style = ParagraphStyle(
        "ReportSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10,
        leading=14,
        textColor=c_blue_lagoon,
    )
    section_heading = ParagraphStyle(
        "SectionHeading",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=16,
        textColor=c_sapphire,
        spaceBefore=10,
        spaceAfter=4,
    )
    cell_style = ParagraphStyle(
        "Cell",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=11,
        textColor=c_dark_text,
    )
    cell_bold = ParagraphStyle(
        "CellBold",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8.5,
        leading=11,
        textColor=c_sapphire,
    )
    disclaimer_style = ParagraphStyle(
        "Disclaimer",
        parent=styles["Normal"],
        fontName="Helvetica-Oblique",
        fontSize=7.5,
        leading=10,
        textColor=colors.HexColor("#666666"),
    )

    story = []

    # Title & Header
    exp_name = experiment_data.get("name", "Quantitative Strategy Report")
    story.append(Paragraph(f"TradeMatrix: {exp_name}", title_style))
    created = str(experiment_data.get("created_at", ""))[:19]
    story.append(Paragraph(f"Generated: {created} | Platform Version: 2.0.0", subtitle_style))
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=1.5, color=c_blue_lagoon, spaceAfter=10))

    # Metadata Grid
    meta = [
        [
            Paragraph("<b>Ticker:</b>", cell_style),
            Paragraph(str(experiment_data.get("ticker", "N/A")), cell_style),
            Paragraph("<b>Strategy:</b>", cell_style),
            Paragraph(str(experiment_data.get("strategy", "N/A")).replace("_", " ").title(), cell_style),
        ],
        [
            Paragraph("<b>Interval:</b>", cell_style),
            Paragraph(str(experiment_data.get("interval", "1d")), cell_style),
            Paragraph("<b>Regime Method:</b>", cell_style),
            Paragraph(str(experiment_data.get("regime_method", "rules")).title(), cell_style),
        ],
        [
            Paragraph("<b>Dataset Range:</b>", cell_style),
            Paragraph(f"{experiment_data.get('start_date', '')} to {experiment_data.get('end_date', '')}", cell_style),
            Paragraph("<b>Fingerprint:</b>", cell_style),
            Paragraph(str(experiment_data.get("dataset_fingerprint", ""))[:16] + "...", cell_style),
        ],
    ]
    meta_table = Table(meta, colWidths=[90, 180, 100, 170])
    meta_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), c_surface),
        ("BOX", (0, 0), (-1, -1), 0.5, c_heather),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#EAEAEA")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 12))

    # Core Performance Metrics Table
    story.append(Paragraph("Performance & Risk Summary (Net of Transaction Costs)", section_heading))
    metrics = experiment_data.get("metrics", {})

    def fmt_pct(val):
        return f"{val:+.2%}" if val is not None else "null"

    def fmt_dec(val):
        return f"{val:.2f}" if val is not None else "null"

    metrics_rows = [
        [
            Paragraph("<b>Metric</b>", cell_bold),
            Paragraph("<b>Strategy</b>", cell_bold),
            Paragraph("<b>Metric</b>", cell_bold),
            Paragraph("<b>Strategy</b>", cell_bold),
        ],
        [
            Paragraph("Total Return", cell_style),
            Paragraph(fmt_pct(metrics.get("total_return")), cell_style),
            Paragraph("Annualized Volatility", cell_style),
            Paragraph(fmt_pct(metrics.get("annualized_volatility")), cell_style),
        ],
        [
            Paragraph("CAGR", cell_style),
            Paragraph(fmt_pct(metrics.get("cagr")), cell_style),
            Paragraph("Max Drawdown", cell_style),
            Paragraph(fmt_pct(metrics.get("max_drawdown")), cell_style),
        ],
        [
            Paragraph("Sharpe Ratio", cell_style),
            Paragraph(fmt_dec(metrics.get("sharpe_ratio")), cell_style),
            Paragraph("Sortino Ratio", cell_style),
            Paragraph(fmt_dec(metrics.get("sortino_ratio")), cell_style),
        ],
        [
            Paragraph("Calmar Ratio", cell_style),
            Paragraph(fmt_dec(metrics.get("calmar_ratio")), cell_style),
            Paragraph("Win Rate (Closed)", cell_style),
            Paragraph(fmt_pct(metrics.get("win_rate")), cell_style),
        ],
        [
            Paragraph("Profit Factor", cell_style),
            Paragraph(fmt_dec(metrics.get("profit_factor")), cell_style),
            Paragraph("Exposure (% Time)", cell_style),
            Paragraph(fmt_pct(metrics.get("exposure")), cell_style),
        ],
        [
            Paragraph("Total Trades", cell_style),
            Paragraph(str(metrics.get("trades_count", 0)), cell_style),
            Paragraph("Annualized Turnover", cell_style),
            Paragraph(fmt_dec(metrics.get("annualized_turnover")), cell_style),
        ],
    ]
    metrics_table = Table(metrics_rows, colWidths=[150, 120, 150, 120])
    metrics_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), c_sapphire),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BOX", (0, 0), (-1, -1), 0.5, c_heather),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#EAEAEA")),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(metrics_table)
    story.append(Spacer(1, 12))

    # Regime Attribution Table
    regime_m = experiment_data.get("regime_metrics", {})
    if regime_m:
        story.append(Paragraph("Performance by Market Regime (Attribution on Signal Date t)", section_heading))
        reg_rows = [
            [
                Paragraph("<b>Regime</b>", cell_bold),
                Paragraph("<b>Observations</b>", cell_bold),
                Paragraph("<b>Ann. Return</b>", cell_bold),
                Paragraph("<b>Sharpe</b>", cell_bold),
                Paragraph("<b>Hit Rate</b>", cell_bold),
                Paragraph("<b>Exposure</b>", cell_bold),
            ]
        ]
        for r_name, r_data in regime_m.items():
            if isinstance(r_data, dict):
                reg_rows.append([
                    Paragraph(r_name, cell_style),
                    Paragraph(str(r_data.get("observations", 0)), cell_style),
                    Paragraph(fmt_pct(r_data.get("annualized_return")), cell_style),
                    Paragraph(fmt_dec(r_data.get("sharpe_ratio")), cell_style),
                    Paragraph(fmt_pct(r_data.get("hit_rate")), cell_style),
                    Paragraph(fmt_pct(r_data.get("exposure")), cell_style),
                ])
        reg_table = Table(reg_rows, colWidths=[130, 80, 80, 80, 85, 85])
        reg_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), c_blue_lagoon),
            ("BOX", (0, 0), (-1, -1), 0.5, c_heather),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#EAEAEA")),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(reg_table)
        story.append(Spacer(1, 14))

    # Disclaimer & Caveats
    story.append(HRFlowable(width="100%", thickness=0.5, color=c_heather, spaceAfter=8))
    story.append(Paragraph(
        "<b>DISCLAIMER:</b> Historical research and educational backtesting only — not investment advice. "
        "Past performance is not indicative of future returns. Models employ close-to-close return approximations "
        "and constant transaction cost assumptions. Surviving survivorship and look-ahead biases requires careful verification.",
        disclaimer_style
    ))

    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()
