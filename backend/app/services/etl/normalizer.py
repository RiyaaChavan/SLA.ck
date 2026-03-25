from collections import defaultdict


CANONICAL_ALIASES = {
    "department": {"dept", "department_name", "business_unit"},
    "vendor": {"supplier", "partner", "vendor_name"},
    "sla_hours": {"tat", "target_hours", "response_due"},
    "billed_units": {"invoice_units", "billed_qty"},
    "delivered_units": {"actual_units", "served_qty"},
}


def suggest_mappings(raw_columns: list[str]) -> dict[str, str]:
    suggestions: dict[str, str] = {}
    lowered = {column.lower(): column for column in raw_columns}
    for canonical, aliases in CANONICAL_ALIASES.items():
        for alias in aliases | {canonical}:
            if alias in lowered:
                suggestions[lowered[alias]] = canonical
    return suggestions


def profile_schema(records: list[dict]) -> dict:
    if not records:
        return {"columns": [], "row_count": 0, "sample_types": {}}
    sample_types = defaultdict(str)
    for column, value in records[0].items():
        sample_types[column] = type(value).__name__
    return {
        "columns": list(records[0].keys()),
        "row_count": len(records),
        "sample_types": dict(sample_types),
    }
