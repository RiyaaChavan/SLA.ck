from collections import Counter
from datetime import UTC, datetime

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.domain import Alert, Organization, Report, ReportStatus
from app.utils.audit import log_event


def generate_pdf_report(db: Session, *, organization_id: int, title: str) -> Report:
    organization = db.get(Organization, organization_id)
    if organization is None:
        raise ValueError("Organization not found")

    alerts = db.scalars(select(Alert).where(Alert.organization_id == organization_id)).all()
    total_exposure = sum(alert.projected_impact for alert in alerts)
    mix = Counter(alert.type.value for alert in alerts)

    report = Report(
        organization_id=organization_id,
        title=title,
        report_type="executive_summary",
        status=ReportStatus.generated,
        summary={
            "total_exposure": round(total_exposure, 2),
            "open_alerts": len(alerts),
            "top_categories": dict(mix),
        },
    )
    db.add(report)
    db.flush()

    settings.reports_dir.mkdir(parents=True, exist_ok=True)
    output = settings.reports_dir / f"report-{organization_id}-{report.id}.pdf"
    pdf = canvas.Canvas(str(output), pagesize=A4)
    width, height = A4
    pdf.setTitle(title)
    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawString(48, height - 50, title)
    pdf.setFont("Helvetica", 11)
    pdf.drawString(48, height - 76, f"Organization: {organization.name}")
    pdf.drawString(48, height - 92, f"Generated: {datetime.now(UTC).isoformat()} UTC")
    pdf.drawString(48, height - 122, f"Projected exposure: Rs {total_exposure:,.2f}")
    pdf.drawString(48, height - 138, f"Active alerts: {len(alerts)}")
    y = height - 172
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(48, y, "Top alert categories")
    pdf.setFont("Helvetica", 11)
    y -= 24
    for category, count in mix.most_common(6):
        pdf.drawString(60, y, f"- {category}: {count}")
        y -= 18
    y -= 8
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(48, y, "Highest exposure alerts")
    pdf.setFont("Helvetica", 10)
    y -= 20
    for alert in sorted(alerts, key=lambda item: item.projected_impact, reverse=True)[:7]:
        pdf.drawString(
            60,
            y,
            f"- {alert.title} | {alert.type.value} | Rs {alert.projected_impact:,.0f}",
        )
        y -= 16
    pdf.save()

    report.storage_path = str(output)
    log_event(
        db,
        organization_id=organization_id,
        entity_type="report",
        entity_id=report.id,
        event_type="generated",
        payload={"storage_path": report.storage_path},
    )
    db.commit()
    db.refresh(report)
    return report


def list_reports(db: Session, organization_id: int) -> list[Report]:
    return db.scalars(
        select(Report).where(Report.organization_id == organization_id).order_by(Report.id.desc())
    ).all()
