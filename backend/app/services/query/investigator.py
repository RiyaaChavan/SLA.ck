from sqlalchemy import text
from sqlalchemy.orm import Session


QUERY_TEMPLATES = [
    {
        "label": "vendor_discrepancy_summary",
        "keywords": {"vendor", "bill", "billing", "invoice", "discrepancy"},
        "sql": """
            SELECT v.name AS vendor_name,
                   COUNT(i.id) AS invoice_count,
                   SUM(
                     CASE
                       WHEN i.billed_units - i.delivered_units > 0
                         THEN (i.billed_units - i.delivered_units) * i.billed_rate
                       ELSE 0
                     END
                   ) AS discrepancy_value
            FROM invoices i
            JOIN vendors v ON v.id = i.vendor_id
            WHERE i.organization_id = :organization_id
            GROUP BY v.name
            ORDER BY discrepancy_value DESC
            LIMIT 10
        """,
        "explanation": "Summarizes vendor-level billing discrepancies from normalized invoice records.",
    },
    {
        "label": "department_sla_backlog",
        "keywords": {"department", "delay", "sla", "backlog", "queue"},
        "sql": """
            SELECT d.name AS department_name,
                   COUNT(w.id) AS delayed_workflows,
                   AVG(w.backlog_hours) AS average_backlog_hours,
                   SUM(w.estimated_value) AS workflow_value
            FROM workflows w
            JOIN departments d ON d.id = w.department_id
            WHERE w.organization_id = :organization_id
              AND w.expected_by < CURRENT_TIMESTAMP
            GROUP BY d.name
            ORDER BY average_backlog_hours DESC
            LIMIT 10
        """,
        "explanation": "Shows departments with the heaviest delay exposure against current workflow backlog.",
    },
    {
        "label": "resource_utilization",
        "keywords": {"resource", "utilization", "license", "infra", "capacity"},
        "sql": """
            SELECT d.name AS department_name,
                   r.resource_name,
                   r.resource_type,
                   r.utilization_pct,
                   r.monthly_cost
            FROM resource_snapshots r
            JOIN departments d ON d.id = r.department_id
            WHERE r.organization_id = :organization_id
            ORDER BY r.utilization_pct DESC
            LIMIT 20
        """,
        "explanation": "Lists the highest-utilization and highest-cost resources across departments.",
    },
]


def build_query(question: str) -> dict:
    tokens = {token.strip(" ?,.").lower() for token in question.split()}
    best = QUERY_TEMPLATES[-1]
    best_score = -1
    for candidate in QUERY_TEMPLATES:
        score = len(tokens & candidate["keywords"])
        if score > best_score:
            best = candidate
            best_score = score
    return best


def run_investigation(db: Session, *, organization_id: int, question: str) -> dict:
    query = build_query(question)
    rows = [dict(row._mapping) for row in db.execute(text(query["sql"]), {"organization_id": organization_id})]
    return {
        "query_label": query["label"],
        "sql": " ".join(query["sql"].split()),
        "rows": rows,
        "explanation": query["explanation"],
    }
