from __future__ import annotations

import argparse
import csv
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from statistics import mean

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, StyleSheet1, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent


@dataclass
class AgreementContext:
    organization_name: str
    organization_country: str
    organization_currency: str
    organization_timezone: str
    vendor_name: str
    vendor_category: str
    city_scope: str
    risk_rating: float
    billing_cycle: str
    payment_terms_days: int
    contract_type: str
    service_unit: str
    contracted_rate_inr: float
    rate_tolerance_pct: int
    start_date: str
    end_date: str
    sla_name: str
    response_deadline_hours: int
    resolution_deadline_hours: int
    penalty_per_breach_inr: int
    auto_action_allowed: bool
    territory: str
    dataset_period: str
    invoice_count: int
    invoice_total_inr: float
    average_invoice_inr: float
    total_service_units: int
    total_validated_units: int
    reconciliation_gap_units: int
    latest_invoice_refs: list[str]
    generated_at_utc: str


def read_csv_rows(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def money(value: float | int) -> str:
    return f"INR {value:,.2f}"


def title_case_slug(value: str) -> str:
    return value.replace("_", " ").title()


def build_context(bundle_dir: Path, vendor_id: int) -> AgreementContext:
    organizations = read_csv_rows(bundle_dir / "organizations.csv")
    if not organizations:
        raise ValueError("organizations.csv is empty")
    organization = organizations[0]

    vendors = {int(row["vendor_id"]): row for row in read_csv_rows(bundle_dir / "vendors.csv")}
    contracts = read_csv_rows(bundle_dir / "contracts.csv")
    cities = read_csv_rows(bundle_dir / "cities.csv")
    invoices = read_csv_rows(bundle_dir / "invoices.csv")
    dataset_readme = (bundle_dir / "README.md").read_text(encoding="utf-8")

    if vendor_id not in vendors:
        raise ValueError(f"Vendor {vendor_id} was not found in vendors.csv")

    vendor = vendors[vendor_id]
    contract = next((row for row in contracts if int(row["vendor_id"]) == vendor_id), None)
    if contract is None:
        raise ValueError(f"No contract found for vendor {vendor_id}")

    vendor_invoices = [row for row in invoices if int(row["vendor_id"]) == vendor_id]
    if not vendor_invoices:
        raise ValueError(f"No invoices found for vendor {vendor_id}")

    invoice_total = sum(float(row["amount_inr"]) for row in vendor_invoices)
    total_service_units = sum(int(row["service_unit_count"]) for row in vendor_invoices)
    total_validated_units = sum(int(row["validated_unit_count"]) for row in vendor_invoices)
    latest_invoice_refs = [
        row["invoice_ref"]
        for row in sorted(vendor_invoices, key=lambda item: (item["invoice_date"], item["invoice_ref"]))
    ][-5:]

    if vendor["city_scope"] == "all_india":
        territory = ", ".join(city["city_name"] for city in cities)
    else:
        territory = "Regional service zones designated by the Company in writing"

    dataset_period_line = next(
        (line.strip() for line in dataset_readme.splitlines() if line.startswith("- Date range:")),
        "- Date range: not stated",
    )
    if dataset_period_line.count("`") >= 4:
        parts = dataset_period_line.split("`")
        dataset_period = f"{parts[1]} to {parts[3]}"
    else:
        dataset_period = "not stated"

    return AgreementContext(
        organization_name=organization["org_name"],
        organization_country=organization["country"],
        organization_currency=organization["currency_code"],
        organization_timezone=organization["timezone"],
        vendor_name=vendor["vendor_name"],
        vendor_category=vendor["vendor_category"],
        city_scope=vendor["city_scope"],
        risk_rating=float(vendor["risk_rating"]),
        billing_cycle=vendor["billing_cycle"],
        payment_terms_days=int(vendor["payment_terms_days"]),
        contract_type=contract["contract_type"],
        service_unit=contract["service_unit"],
        contracted_rate_inr=float(contract["contracted_rate_inr"]),
        rate_tolerance_pct=int(contract["rate_tolerance_pct"]),
        start_date=contract["start_date"],
        end_date=contract["end_date"],
        sla_name=contract["sla_name"],
        response_deadline_hours=int(contract["response_deadline_hours"]),
        resolution_deadline_hours=int(contract["resolution_deadline_hours"]),
        penalty_per_breach_inr=int(contract["penalty_per_breach_inr"]),
        auto_action_allowed=contract["auto_action_allowed"].lower() == "true",
        territory=territory,
        dataset_period=dataset_period,
        invoice_count=len(vendor_invoices),
        invoice_total_inr=invoice_total,
        average_invoice_inr=mean(float(row["amount_inr"]) for row in vendor_invoices),
        total_service_units=total_service_units,
        total_validated_units=total_validated_units,
        reconciliation_gap_units=total_service_units - total_validated_units,
        latest_invoice_refs=latest_invoice_refs,
        generated_at_utc=datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S UTC"),
    )


def build_markdown(ctx: AgreementContext) -> str:
    service_description = (
        "last-mile pickup, rider allocation, transport, and proof-of-delivery services for customer "
        "orders originating from the Company's dark stores"
        if ctx.contract_type == "last_mile_service"
        else f"{title_case_slug(ctx.contract_type)} services"
    )
    auto_action_text = (
        "The Company may initiate temporary rerouting, capacity reallocation, or substitute vendor actions "
        "where a material service interruption is detected."
        if ctx.auto_action_allowed
        else "Operational remediation actions require express written approval from the Company."
    )
    lines = [
        "# Master Vendor Services Agreement",
        "",
        f"Prepared from repository data on {ctx.generated_at_utc}.",
        "",
        "This Master Vendor Services Agreement (\"Agreement\") is entered into with effect from "
        f"**{ctx.start_date}** (\"Effective Date\") by and between **{ctx.organization_name}** "
        f"(\"Company\") and **{ctx.vendor_name}** (\"Service Provider\").",
        "",
        "## 1. Scope",
        "",
        f"The Service Provider shall perform {service_description} across {ctx.territory}. "
        "Services shall be rendered in accordance with purchase orders, route plans, shift rosters, "
        "and operational instructions issued by the Company from time to time.",
        "",
        "## 2. Commercial Terms",
        "",
        f"- Contract type: {title_case_slug(ctx.contract_type)}",
        f"- Service unit: {title_case_slug(ctx.service_unit)}",
        f"- Contracted rate: {money(ctx.contracted_rate_inr)} per {ctx.service_unit.replace('_', ' ')}",
        f"- Billing cycle: {ctx.billing_cycle.title()}",
        f"- Payment terms: {ctx.payment_terms_days} days from receipt of an undisputed invoice",
        f"- Rate tolerance on invoice review: {ctx.rate_tolerance_pct}%",
        f"- Agreement term: {ctx.start_date} to {ctx.end_date}",
        "",
        "## 3. SLA and Service Credits",
        "",
        f"The applicable operational SLA is **{ctx.sla_name}**. The Service Provider shall acknowledge "
        f"critical incidents within {ctx.response_deadline_hours} hour(s) and resolve them within "
        f"{ctx.resolution_deadline_hours} hour(s). Each material breach may attract a service credit or "
        f"liquidated damages amount of {money(ctx.penalty_per_breach_inr)}.",
        "",
        f"{auto_action_text}",
        "",
        "## 4. Invoicing and Validation",
        "",
        "Invoices shall reference store, city, billing period, service-unit counts, validated-unit counts, "
        "and the applicable contracted rate. The Company may dispute any billed rate that exceeds the "
        "contracted rate by more than the tolerance stated above or any unsupported service-unit count.",
        "",
        f"Observed benchmark from the current synthetic operating bundle ({ctx.dataset_period}): "
        f"{ctx.invoice_count} invoice(s), {ctx.total_validated_units:,} validated unit(s), and aggregate "
        f"billing of {money(ctx.invoice_total_inr)}. Current reconciliation gap between billed and validated "
        f"units: {ctx.reconciliation_gap_units:,}.",
        "",
        "## 5. Data, Audit, and Records",
        "",
        "Order, dispatch, route, delivery, and proof records exchanged through the Company's operating "
        "systems, API feeds, CSV bundles, or normalized business records shall constitute primary evidence "
        "for service verification, invoicing, dispute resolution, and SLA measurement.",
        "",
        "## 6. Standard Legal Terms",
        "",
        "The parties shall maintain confidentiality, comply with applicable law, maintain adequate insurance, "
        "indemnify each other for third-party claims arising from their own breach or negligence, and submit "
        "disputes to good-faith escalation before court or arbitral proceedings under Indian law.",
        "",
        "## Schedule A - Snapshot",
        "",
        f"- Vendor category: {title_case_slug(ctx.vendor_category)}",
        f"- Territory: {ctx.territory}",
        f"- Currency: {ctx.organization_currency}",
        f"- Time zone: {ctx.organization_timezone}",
        f"- Average invoice value in current dataset: {money(ctx.average_invoice_inr)}",
        f"- Recent invoice references: {', '.join(ctx.latest_invoice_refs)}",
        "",
        "## Signatures",
        "",
        f"For {ctx.organization_name}",
        "",
        "Name: ____________________",
        "",
        "Title: _____________________",
        "",
        "Date: ______________________",
        "",
        f"For {ctx.vendor_name}",
        "",
        "Name: ____________________",
        "",
        "Title: _____________________",
        "",
        "Date: ______________________",
        "",
        "> Demo note: this agreement was generated from synthetic repository data and is intended as a realistic sample artifact, not executed legal advice.",
        "",
    ]
    return "\n".join(lines)


def build_styles() -> StyleSheet1:
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="AgreementTitle",
            parent=styles["Title"],
            fontName="Helvetica-Bold",
            fontSize=20,
            leading=24,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#1a1a1a"),
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="AgreementSubtitle",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=9,
            leading=12,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#555555"),
            spaceAfter=18,
        )
    )
    styles.add(
        ParagraphStyle(
            name="AgreementBody",
            parent=styles["BodyText"],
            fontName="Times-Roman",
            fontSize=10.5,
            leading=15,
            alignment=TA_JUSTIFY,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="AgreementHeading",
            parent=styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=11.5,
            leading=14,
            textColor=colors.HexColor("#1f3b5b"),
            spaceBefore=10,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="AgreementSmall",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=11,
            textColor=colors.HexColor("#666666"),
        )
    )
    styles.add(
        ParagraphStyle(
            name="AgreementRight",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=9,
            alignment=TA_RIGHT,
            textColor=colors.HexColor("#555555"),
        )
    )
    return styles


def add_paragraphs(story: list, styles: StyleSheet1, sections: list[tuple[str, str]]) -> None:
    for heading, body in sections:
        story.append(Paragraph(heading, styles["AgreementHeading"]))
        story.append(Paragraph(body, styles["AgreementBody"]))


def render_pdf(ctx: AgreementContext, pdf_path: Path) -> None:
    styles = build_styles()
    doc = SimpleDocTemplate(
        str(pdf_path),
        pagesize=A4,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        title="Master Vendor Services Agreement",
        author="Codex",
    )
    service_description = (
        "last-mile pickup, rider allocation, transport, and proof-of-delivery services for customer "
        "orders originating from the Company's dark stores"
        if ctx.contract_type == "last_mile_service"
        else f"{title_case_slug(ctx.contract_type)} services"
    )
    story: list = []

    story.append(Spacer(1, 14 * mm))
    story.append(Paragraph("MASTER VENDOR SERVICES AGREEMENT", styles["AgreementTitle"]))
    story.append(
        Paragraph(
            f"Between {ctx.organization_name} and {ctx.vendor_name}",
            styles["AgreementSubtitle"],
        )
    )
    story.append(
        Table(
            [
                ["Effective Date", ctx.start_date, "Scheduled End Date", ctx.end_date],
                ["Contract Type", title_case_slug(ctx.contract_type), "Service Unit", title_case_slug(ctx.service_unit)],
                ["Contracted Rate", money(ctx.contracted_rate_inr), "Billing Cycle", ctx.billing_cycle.title()],
                ["Payment Terms", f"{ctx.payment_terms_days} days", "Service Territory", ctx.city_scope.replace("_", " ").title()],
            ],
            colWidths=[34 * mm, 46 * mm, 34 * mm, 56 * mm],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f7f9fc")),
                    ("BOX", (0, 0), (-1, -1), 0.75, colors.HexColor("#9aa9bb")),
                    ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#c5d0dd")),
                    ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                    ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                    ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("LEADING", (0, 0), (-1, -1), 11),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("TOPPADDING", (0, 0), (-1, -1), 7),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                ]
            ),
        )
    )
    story.append(Spacer(1, 8 * mm))
    story.append(
        Paragraph(
            "This Master Vendor Services Agreement (the \"Agreement\") is entered into with effect from "
            f"{ctx.start_date} (the \"Effective Date\") by and between <b>{ctx.organization_name}</b>, "
            f"an organization operating in {ctx.organization_country} (the \"Company\"), and "
            f"<b>{ctx.vendor_name}</b> (the \"Service Provider\"). The parties agree as follows:",
            styles["AgreementBody"],
        )
    )
    add_paragraphs(
        story,
        styles,
        [
            (
                "1. Appointment and Scope of Services",
                f"The Company appoints the Service Provider, on a non-exclusive basis, to perform "
                f"{service_description} across {ctx.territory}. Services shall be performed in accordance "
                "with operating plans, dispatch protocols, shift allocations, pickup schedules, and written "
                "instructions communicated by the Company from time to time.",
            ),
            (
                "2. Service Levels",
                f"The Service Provider shall comply with the service levels described in the operational SLA "
                f"identified as {ctx.sla_name}. Critical incidents shall be acknowledged within "
                f"{ctx.response_deadline_hours} hour(s) and resolved within {ctx.resolution_deadline_hours} "
                "hour(s), unless a longer period is approved in writing by the Company for a specific incident.",
            ),
            (
                "3. Pricing, Billing, and Taxes",
                f"The Company shall pay the Service Provider a contracted rate of {money(ctx.contracted_rate_inr)} "
                f"per {ctx.service_unit.replace('_', ' ')}. Billing shall occur on a {ctx.billing_cycle} cycle. "
                f"Undisputed invoices are payable within {ctx.payment_terms_days} days after receipt. Unless "
                "otherwise required by law, all fees are exclusive of indirect taxes, which shall be separately "
                "stated on a valid tax invoice.",
            ),
            (
                "4. Validation and Invoice Reconciliation",
                f"Each invoice shall include the applicable billing period, store and city reference, service-unit "
                "counts, validated-unit counts, billed rate, contracted rate, and supporting evidence. The Company "
                f"may reject or dispute any invoice where the billed rate exceeds the contracted rate by more than "
                f"{ctx.rate_tolerance_pct}% or where service-unit counts are not supported by underlying records.",
            ),
            (
                "5. Service Credits, Set-Off, and Operational Remedies",
                f"Each material SLA breach may attract service credits or liquidated damages of "
                f"{money(ctx.penalty_per_breach_inr)} per breach, without prejudice to other contractual remedies. "
                + (
                    "The Company may also initiate temporary rerouting, substitute capacity, or provisional "
                    "operational workarounds when a material service disruption is detected."
                    if ctx.auto_action_allowed
                    else "Any substitute operational response requiring third-party cost must be approved in writing by the Company."
                ),
            ),
            (
                "6. Records, Data Exchange, and Audit",
                "Order, dispatch, route, delivery, proof-of-delivery, and reconciliation data exchanged through the "
                "Company's systems, API integrations, operational exports, CSV bundles, or normalized business records "
                "shall constitute primary evidence for performance verification, invoice validation, SLA measurement, "
                "and dispute resolution. The Service Provider shall retain supporting records for at least twenty-four months.",
            ),
            (
                "7. Personnel, Compliance, and Subcontracting",
                "The Service Provider shall ensure that all personnel are properly trained, supervised, and lawfully engaged. "
                "It shall comply with applicable labour, tax, health and safety, anti-bribery, and data protection laws. "
                "No subcontracting that materially affects service performance shall be permitted without prior written consent.",
            ),
            (
                "8. Confidentiality and Data Security",
                "Each party shall keep confidential all commercial, technical, operational, and customer information disclosed "
                "under this Agreement and shall use such information solely for performance of this Agreement. Appropriate "
                "administrative, technical, and physical safeguards shall be maintained to protect Company data.",
            ),
            (
                "9. Indemnity and Liability",
                "Each party shall indemnify the other against third-party claims arising from its own breach of law, gross negligence, "
                "or willful misconduct. Neither party shall be liable for indirect or consequential losses except in cases of fraud, "
                "confidentiality breach, intellectual property infringement, or unpaid fees lawfully due.",
            ),
            (
                "10. Term, Termination, and Exit",
                f"This Agreement shall continue from {ctx.start_date} until {ctx.end_date}, unless terminated earlier for cause, "
                "persistent SLA failure, insolvency, or material breach not cured within a reasonable notice period. On expiry or "
                "termination, the Service Provider shall cooperate in an orderly transition of services and records.",
            ),
            (
                "11. Governing Law and Dispute Resolution",
                "This Agreement shall be governed by the laws of India. The parties shall first escalate disputes to senior "
                "commercial representatives for good-faith resolution. Failing settlement, disputes may be referred to the "
                "competent courts or to arbitration if the parties so agree in writing.",
            ),
        ],
    )

    story.append(PageBreak())
    story.append(Paragraph("Schedule A - Commercial Schedule", styles["AgreementHeading"]))
    schedule_a = Table(
        [
            ["Item", "Agreed Position"],
            ["Company", ctx.organization_name],
            ["Service Provider", ctx.vendor_name],
            ["Vendor Category", title_case_slug(ctx.vendor_category)],
            ["Contract Type", title_case_slug(ctx.contract_type)],
            ["Service Unit", title_case_slug(ctx.service_unit)],
            ["Contracted Rate", money(ctx.contracted_rate_inr)],
            ["Billing Cycle", ctx.billing_cycle.title()],
            ["Payment Terms", f"{ctx.payment_terms_days} days from receipt of undisputed invoice"],
            ["Rate Tolerance", f"{ctx.rate_tolerance_pct}%"],
            ["Territory", ctx.territory],
            ["Currency", ctx.organization_currency],
            ["Time Zone", ctx.organization_timezone],
        ],
        colWidths=[52 * mm, 116 * mm],
        style=TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f3b5b")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold"),
                ("FONTNAME", (1, 1), (1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("LEADING", (0, 0), (-1, -1), 11),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#b9c5d3")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f7f9fc")]),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        ),
    )
    story.append(schedule_a)
    story.append(Spacer(1, 8 * mm))

    story.append(Paragraph("Schedule B - SLA and Remedies", styles["AgreementHeading"]))
    schedule_b = Table(
        [
            ["Control", "Requirement"],
            ["Operational SLA", ctx.sla_name],
            ["Incident Response Time", f"{ctx.response_deadline_hours} hour(s)"],
            ["Incident Resolution Time", f"{ctx.resolution_deadline_hours} hour(s)"],
            ["Service Credit / Liquidated Damages", money(ctx.penalty_per_breach_inr)],
            [
                "Operational Remedy Rights",
                "Temporary rerouting and substitute capacity permitted"
                if ctx.auto_action_allowed
                else "Operational remedy requires written Company approval",
            ],
        ],
        colWidths=[60 * mm, 108 * mm],
        style=TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#5b7aa0")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold"),
                ("FONTNAME", (1, 1), (1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#b9c5d3")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f7f9fc")]),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        ),
    )
    story.append(schedule_b)
    story.append(Spacer(1, 8 * mm))

    story.append(Paragraph("Schedule C - Current Operating Benchmark", styles["AgreementHeading"]))
    story.append(
        Paragraph(
            f"The current synthetic dataset for this repository covers {ctx.dataset_period}. For {ctx.vendor_name}, the "
            f"bundle shows {ctx.invoice_count} invoice(s), total billed value of {money(ctx.invoice_total_inr)}, "
            f"average invoice value of {money(ctx.average_invoice_inr)}, {ctx.total_service_units:,} billed unit(s), "
            f"{ctx.total_validated_units:,} validated unit(s), and a reconciliation gap of {ctx.reconciliation_gap_units:,} unit(s). "
            "These figures are included as commercial context and do not amend the payment obligations stated above.",
            styles["AgreementBody"],
        )
    )
    story.append(
        Table(
            [["Recent Invoice References"], [", ".join(ctx.latest_invoice_refs)]],
            colWidths=[168 * mm],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#eef3f8")),
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#b9c5d3")),
                    ("FONTNAME", (0, 0), (0, 0), "Helvetica-Bold"),
                    ("FONTNAME", (0, 1), (0, 1), "Helvetica"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("TOPPADDING", (0, 0), (-1, -1), 6),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ]
            ),
        )
    )

    story.append(Spacer(1, 10 * mm))
    story.append(Paragraph("Execution", styles["AgreementHeading"]))
    signatures = Table(
        [
            [f"For {ctx.organization_name}", f"For {ctx.vendor_name}"],
            ["Name: __________________________", "Name: __________________________"],
            ["Title: ___________________________", "Title: ___________________________"],
            ["Date: ____________________________", "Date: ____________________________"],
            ["Signature: _______________________", "Signature: _______________________"],
        ],
        colWidths=[84 * mm, 84 * mm],
        style=TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("LEADING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        ),
    )
    story.append(signatures)
    story.append(Spacer(1, 4 * mm))
    story.append(
        Paragraph(
            "Demo note: this agreement is a realistic sample artifact generated from synthetic repository data. "
            "It is not an executed contract and should not be used as legal advice.",
            styles["AgreementSmall"],
        )
    )

    def draw_header_footer(canvas, doc) -> None:
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.HexColor("#666666"))
        canvas.drawString(doc.leftMargin, 12 * mm, "Master Vendor Services Agreement")
        canvas.drawRightString(
            A4[0] - doc.rightMargin,
            12 * mm,
            f"Page {canvas.getPageNumber()}",
        )
        canvas.setStrokeColor(colors.HexColor("#d7dde5"))
        canvas.line(doc.leftMargin, 15 * mm, A4[0] - doc.rightMargin, 15 * mm)
        canvas.restoreState()

    doc.build(story, onFirstPage=draw_header_footer, onLaterPages=draw_header_footer)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a realistic vendor agreement PDF from the repo data.")
    parser.add_argument(
        "--bundle-dir",
        type=Path,
        default=REPO_ROOT / "data/synthetic/delivra_india",
        help="Path to the synthetic bundle directory.",
    )
    parser.add_argument(
        "--vendor-id",
        type=int,
        default=1,
        help="Vendor ID to generate the agreement for.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=REPO_ROOT / "docs/generated",
        help="Directory where the PDF and source markdown should be written.",
    )
    args = parser.parse_args()

    bundle_dir = args.bundle_dir.resolve()
    output_dir = args.output_dir.resolve()

    ctx = build_context(bundle_dir, args.vendor_id)
    output_dir.mkdir(parents=True, exist_ok=True)

    slug = f"{ctx.organization_name}_{ctx.vendor_name}".lower().replace(" ", "-")
    markdown_path = output_dir / f"{slug}_master-vendor-services-agreement.md"
    pdf_path = output_dir / f"{slug}_master-vendor-services-agreement.pdf"

    markdown_path.write_text(build_markdown(ctx), encoding="utf-8")
    render_pdf(ctx, pdf_path)

    print(markdown_path)
    print(pdf_path)


if __name__ == "__main__":
    main()
SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
