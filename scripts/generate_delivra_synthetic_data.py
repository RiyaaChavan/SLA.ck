#!/usr/bin/env python3

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import random
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from faker import Faker


IST = ZoneInfo("Asia/Kolkata")


CITY_CONFIGS = [
    {
        "name": "Bengaluru",
        "state": "Karnataka",
        "tier": "metro",
        "population_bucket": "10m+",
        "rain_risk_score": 0.23,
        "traffic_risk_score": 0.78,
        "demand_multiplier": 1.18,
        "store_count": 7,
        "lat": 12.9716,
        "lon": 77.5946,
    },
    {
        "name": "Mumbai",
        "state": "Maharashtra",
        "tier": "metro",
        "population_bucket": "10m+",
        "rain_risk_score": 0.36,
        "traffic_risk_score": 0.84,
        "demand_multiplier": 1.15,
        "store_count": 7,
        "lat": 19.0760,
        "lon": 72.8777,
    },
    {
        "name": "Delhi NCR",
        "state": "Delhi",
        "tier": "metro",
        "population_bucket": "10m+",
        "rain_risk_score": 0.18,
        "traffic_risk_score": 0.8,
        "demand_multiplier": 1.12,
        "store_count": 6,
        "lat": 28.6139,
        "lon": 77.2090,
    },
    {
        "name": "Hyderabad",
        "state": "Telangana",
        "tier": "metro",
        "population_bucket": "5m-10m",
        "rain_risk_score": 0.22,
        "traffic_risk_score": 0.61,
        "demand_multiplier": 0.97,
        "store_count": 5,
        "lat": 17.3850,
        "lon": 78.4867,
    },
    {
        "name": "Pune",
        "state": "Maharashtra",
        "tier": "tier_1",
        "population_bucket": "5m-10m",
        "rain_risk_score": 0.27,
        "traffic_risk_score": 0.55,
        "demand_multiplier": 0.89,
        "store_count": 5,
        "lat": 18.5204,
        "lon": 73.8567,
    },
    {
        "name": "Chennai",
        "state": "Tamil Nadu",
        "tier": "metro",
        "population_bucket": "5m-10m",
        "rain_risk_score": 0.24,
        "traffic_risk_score": 0.58,
        "demand_multiplier": 0.86,
        "store_count": 4,
        "lat": 13.0827,
        "lon": 80.2707,
    },
]

MICRO_MARKETS = {
    "Bengaluru": ["HSR", "Indiranagar", "Whitefield", "Koramangala", "Hebbal", "Jayanagar"],
    "Mumbai": ["Powai", "Andheri", "Bandra", "Thane", "Ghatkopar", "Navi Mumbai"],
    "Delhi NCR": ["Gurugram", "Noida", "Dwarka", "Saket", "Rohini", "Indirapuram"],
    "Hyderabad": ["Madhapur", "Gachibowli", "Kondapur", "Banjara Hills", "Kukatpally"],
    "Pune": ["Baner", "Kothrud", "Wakad", "Viman Nagar", "Hadapsar"],
    "Chennai": ["OMR", "Adyar", "Anna Nagar", "Velachery", "Porur"],
}

STORE_SIZE_CONFIG = {
    "small": {
        "daily_order_capacity": (280, 430),
        "pick_capacity_per_hour": (28, 42),
        "inventory_slot_capacity": (1600, 2400),
        "cold_storage_capacity_units": (120, 220),
    },
    "medium": {
        "daily_order_capacity": (430, 720),
        "pick_capacity_per_hour": (42, 68),
        "inventory_slot_capacity": (2400, 3600),
        "cold_storage_capacity_units": (220, 380),
    },
    "large": {
        "daily_order_capacity": (720, 1100),
        "pick_capacity_per_hour": (68, 96),
        "inventory_slot_capacity": (3600, 5200),
        "cold_storage_capacity_units": (380, 560),
    },
}

HOURLY_WEIGHTS = {
    6: 0.25,
    7: 0.55,
    8: 0.85,
    9: 0.95,
    10: 0.92,
    11: 1.0,
    12: 1.18,
    13: 1.22,
    14: 1.0,
    15: 0.88,
    16: 0.94,
    17: 1.08,
    18: 1.32,
    19: 1.46,
    20: 1.38,
    21: 1.18,
    22: 0.86,
    23: 0.35,
}

PAYMENT_METHODS = [("upi", 0.63), ("card", 0.17), ("wallet", 0.08), ("cod", 0.12)]
VEHICLE_TYPES = [("bike", 0.9), ("scooter", 0.08), ("ecycle", 0.02)]
EMPLOYMENT_MODES = [("partner", 0.79), ("contract", 0.16), ("full_time", 0.05)]
SKU_CATALOG = [
    ("Bananas", "fruits", 52, 26),
    ("Tomatoes", "vegetables", 40, 18),
    ("Milk 1L", "dairy", 68, 46),
    ("Curd 400g", "dairy", 48, 32),
    ("Bread Loaf", "bakery", 42, 24),
    ("Eggs 12 Pack", "dairy", 84, 61),
    ("Potato 1kg", "vegetables", 34, 16),
    ("Onion 1kg", "vegetables", 38, 20),
    ("Rice 5kg", "staples", 355, 275),
    ("Atta 5kg", "staples", 325, 242),
    ("Cooking Oil 1L", "staples", 165, 124),
    ("Chips", "snacks", 25, 14),
    ("Biscuits", "snacks", 34, 17),
    ("Soft Drink 750ml", "beverages", 42, 22),
    ("Juice 1L", "beverages", 118, 72),
    ("Detergent 1kg", "household", 176, 126),
    ("Dishwash Liquid", "household", 108, 69),
    ("Toothpaste", "personal_care", 96, 58),
    ("Soap Pack", "personal_care", 86, 48),
    ("Diapers", "baby_care", 399, 298),
]

VENDORS = [
    ("FlashFleet Partners", "last_mile_partner", "all_india", 0.41, "weekly", 14),
    ("SwiftDrop Logistics", "last_mile_partner", "regional", 0.46, "weekly", 10),
    ("PackRight Materials", "packaging_supplier", "all_india", 0.28, "monthly", 30),
    ("FreshWrap Consumables", "packaging_supplier", "regional", 0.34, "monthly", 21),
    ("CoolChain Services", "cold_chain_supplier", "regional", 0.31, "monthly", 21),
    ("NorthStar Cold Logistics", "cold_chain_supplier", "all_india", 0.37, "monthly", 30),
    ("ShiftPilot Staffing", "staffing_agency", "regional", 0.43, "weekly", 14),
    ("BlueCrew Workforce", "staffing_agency", "all_india", 0.39, "weekly", 14),
    ("OpsGrid SaaS", "software_saas", "all_india", 0.18, "monthly", 30),
    ("RouteSense Cloud", "software_saas", "all_india", 0.22, "monthly", 30),
]

APPROVAL_PLAYBOOKS = [
    ("duplicate_vendor_invoice", "high", "hold_vendor_payment", "finance_control", "finance_controller", "finance_controller", "false"),
    ("contract_rate_drift", "high", "open_procurement_review", "procurement", "procurement_manager", "finance_controller", "false"),
    ("validated_units_mismatch", "medium", "raise_vendor_dispute", "finance_control", "finance_analyst", "finance_controller", "false"),
    ("driver_shortage_peak_window", "medium", "reroute_fleet_capacity", "fleet_ops", "fleet_manager", "city_ops_manager", "true"),
    ("warehouse_pick_backlog", "medium", "shift_store_staffing", "dark_store_ops", "dark_store_manager", "city_ops_manager", "true"),
    ("cold_chain_breach_risk", "high", "escalate_cold_chain_incident", "inventory_control", "inventory_lead", "city_ops_manager", "false"),
    ("saas_license_underuse", "low", "reduce_unused_seats", "procurement", "procurement_manager", "finance_controller", "false"),
    ("store_underuse", "medium", "review_store_consolidation", "regional_command", "regional_ops_head", "regional_ops_head", "false"),
]


@dataclass
class DailyStoreContext:
    date_value: date
    store_id: int
    city_id: int
    rain_flag: bool
    surge_flag: bool
    peak_demand_multiplier: float
    planned_pickers: int
    present_pickers: int
    planned_packers: int
    present_packers: int
    planned_drivers: int
    active_drivers: int
    dispatch_bays: int
    active_dispatch_bays: int
    cold_storage_units: int
    active_cold_storage_units: int
    saas_licenses: int
    active_saas_licenses: int
    total_orders: int = 0
    delivered_orders: int = 0
    cancelled_orders: int = 0
    late_orders: int = 0
    gross_basket_value: float = 0.0
    total_delivery_minutes: float = 0.0
    severe_driver_shortage: bool = False
    severe_staff_shortage: bool = False
    cold_chain_risk: bool = False
    underused_store: bool = False
    peak_delay_cluster: bool = False


def weighted_choice(rng: random.Random, items: list[tuple[str, float]]) -> str:
    values = [item[0] for item in items]
    weights = [item[1] for item in items]
    return rng.choices(values, weights=weights, k=1)[0]


def bounded_gauss(rng: random.Random, mean: float, stddev: float, lower: float, upper: float) -> float:
    value = rng.gauss(mean, stddev)
    return max(lower, min(upper, value))


def allocate_counts(total: int, buckets: int, rng: random.Random) -> list[int]:
    if buckets <= 1:
        return [total]
    cuts = sorted(rng.sample(range(1, total), buckets - 1)) if total > buckets else list(range(1, buckets))
    points = [0, *cuts, total]
    counts = [points[i + 1] - points[i] for i in range(len(points) - 1)]
    while len(counts) < buckets:
        counts.append(1)
    return counts[:buckets]


def stable_customer_id(order_id: int) -> str:
    return hashlib.sha256(f"customer-{order_id}".encode()).hexdigest()[:16]


def to_iso(dt: datetime) -> str:
    return dt.astimezone(IST).isoformat()


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


class CsvBundleWriter:
    def __init__(self, output_dir: Path):
        self.output_dir = output_dir
        self.handles: dict[str, tuple[object, csv.DictWriter]] = {}

    def open(self, name: str, fieldnames: list[str]) -> csv.DictWriter:
        file_path = self.output_dir / name
        handle = file_path.open("w", newline="", encoding="utf-8")
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        self.handles[name] = (handle, writer)
        return writer

    def close(self) -> None:
        for handle, _ in self.handles.values():
            handle.close()


def build_store(city: dict, city_id: int, store_index: int, store_id: int, rng: random.Random) -> dict:
    size = rng.choices(["small", "medium", "large"], weights=[0.34, 0.46, 0.2], k=1)[0]
    spec = STORE_SIZE_CONFIG[size]
    market = MICRO_MARKETS[city["name"]][store_index % len(MICRO_MARKETS[city["name"]])]
    lat = city["lat"] + rng.uniform(-0.09, 0.09)
    lon = city["lon"] + rng.uniform(-0.09, 0.09)
    daily_capacity = rng.randint(*spec["daily_order_capacity"])
    if city["tier"] == "metro":
        daily_capacity = int(daily_capacity * rng.uniform(0.97, 1.1))
    return {
        "store_id": store_id,
        "org_id": 1,
        "city_id": city_id,
        "store_name": f"{city['name']} {market} DS-{store_index + 1}",
        "micro_market": market,
        "latitude": round(lat, 6),
        "longitude": round(lon, 6),
        "opening_hour": "06:00",
        "closing_hour": "23:59",
        "daily_order_capacity": daily_capacity,
        "pick_capacity_per_hour": rng.randint(*spec["pick_capacity_per_hour"]),
        "inventory_slot_capacity": rng.randint(*spec["inventory_slot_capacity"]),
        "cold_storage_capacity_units": rng.randint(*spec["cold_storage_capacity_units"]),
        "active_flag": "true",
        "store_size": size,
        "base_demand": int(daily_capacity * rng.uniform(0.4, 0.62)),
    }


def generate_bundle(output_dir: Path, days: int, seed: int) -> dict[str, int]:
    rng = random.Random(seed)
    fake = Faker("en_IN")
    fake.seed_instance(seed)
    ensure_dir(output_dir)
    writer = CsvBundleWriter(output_dir)

    counts: dict[str, int] = defaultdict(int)
    anomaly_counter: Counter[str] = Counter()
    today = datetime.now(IST).date()
    start_date = today - timedelta(days=days)
    recent_open_cutoff = today - timedelta(days=2)

    organizations_writer = writer.open(
        "organizations.csv",
        ["org_id", "org_name", "industry", "country", "currency_code", "timezone"],
    )
    cities_writer = writer.open(
        "cities.csv",
        ["city_id", "city_name", "tier", "state", "population_bucket", "rain_risk_score", "traffic_risk_score", "demand_multiplier"],
    )
    stores_writer = writer.open(
        "dark_stores.csv",
        [
            "store_id",
            "org_id",
            "city_id",
            "store_name",
            "micro_market",
            "latitude",
            "longitude",
            "opening_hour",
            "closing_hour",
            "daily_order_capacity",
            "pick_capacity_per_hour",
            "inventory_slot_capacity",
            "cold_storage_capacity_units",
            "active_flag",
        ],
    )
    employees_writer = writer.open(
        "employees.csv",
        [
            "employee_id",
            "org_id",
            "team_id",
            "store_id",
            "city_id",
            "employee_name",
            "role",
            "manager_employee_id",
            "employment_type",
            "shift_type",
            "tenure_months",
            "base_monthly_salary_inr",
            "productivity_score",
            "attendance_risk_score",
            "active_flag",
        ],
    )
    drivers_writer = writer.open(
        "drivers.csv",
        [
            "driver_id",
            "org_id",
            "city_id",
            "primary_store_id",
            "fleet_team_id",
            "driver_name",
            "vehicle_type",
            "employment_mode",
            "tenure_months",
            "rating",
            "acceptance_rate",
            "on_time_rate",
            "daily_order_capacity",
            "attendance_risk_score",
            "active_flag",
        ],
    )
    vendors_writer = writer.open(
        "vendors.csv",
        ["vendor_id", "org_id", "vendor_name", "vendor_category", "city_scope", "risk_rating", "billing_cycle", "payment_terms_days"],
    )
    contracts_writer = writer.open(
        "contracts.csv",
        [
            "contract_id",
            "org_id",
            "vendor_id",
            "contract_type",
            "service_unit",
            "contracted_rate_inr",
            "rate_tolerance_pct",
            "start_date",
            "end_date",
            "sla_name",
            "response_deadline_hours",
            "resolution_deadline_hours",
            "penalty_per_breach_inr",
            "auto_action_allowed",
        ],
    )
    orders_writer = writer.open(
        "orders.csv",
        [
            "order_id",
            "org_id",
            "city_id",
            "store_id",
            "customer_id_hash",
            "order_ts",
            "promised_eta_minutes",
            "actual_delivery_minutes",
            "basket_value_inr",
            "discount_value_inr",
            "delivery_fee_inr",
            "payment_method",
            "order_status",
            "item_count",
            "distance_km",
            "assigned_driver_id",
            "picker_employee_id",
            "packer_employee_id",
            "peak_flag",
            "rain_flag",
            "surge_flag",
        ],
    )
    order_items_writer = writer.open(
        "order_items.csv",
        [
            "order_item_id",
            "order_id",
            "sku_id",
            "sku_name",
            "category",
            "quantity",
            "mrp_inr",
            "selling_price_inr",
            "procurement_cost_inr",
            "substituted_flag",
            "fulfilled_flag",
        ],
    )
    delivery_writer = writer.open(
        "delivery_events.csv",
        ["event_id", "order_id", "driver_id", "store_id", "event_type", "event_ts", "event_sequence", "gps_distance_km", "delay_reason"],
    )
    inventory_writer = writer.open(
        "inventory_snapshots.csv",
        [
            "snapshot_id",
            "snapshot_ts",
            "store_id",
            "city_id",
            "resource_type",
            "resource_name",
            "active_units",
            "provisioned_units",
            "utilization_pct",
            "monthly_cost_inr",
            "shift_staff_present",
            "shift_staff_planned",
        ],
    )
    work_items_writer = writer.open(
        "work_items.csv",
        [
            "work_item_id",
            "org_id",
            "city_id",
            "store_id",
            "team_id",
            "item_type",
            "priority",
            "opened_at",
            "expected_by",
            "resolved_at",
            "status",
            "estimated_value_inr",
            "backlog_hours",
            "linked_order_id",
            "linked_vendor_id",
        ],
    )
    invoices_writer = writer.open(
        "invoices.csv",
        [
            "invoice_id",
            "org_id",
            "vendor_id",
            "contract_id",
            "store_id",
            "city_id",
            "invoice_ref",
            "invoice_date",
            "billing_period_start",
            "billing_period_end",
            "service_unit_count",
            "validated_unit_count",
            "billed_rate_inr",
            "contracted_rate_inr",
            "amount_inr",
            "status",
        ],
    )
    anomalies_writer = writer.open(
        "ground_truth_anomalies.csv",
        [
            "anomaly_id",
            "entity_type",
            "entity_id",
            "anomaly_type",
            "module",
            "severity",
            "start_ts",
            "end_ts",
            "projected_impact_inr",
            "realized_impact_inr",
            "formula_name",
            "formula_inputs_json",
            "root_cause",
            "recommended_action",
            "required_team_type",
            "required_role",
            "expected_approver_role",
        ],
    )
    playbooks_writer = writer.open(
        "approval_playbooks.csv",
        ["anomaly_type", "risk_level", "recommended_action", "required_team_type", "required_role", "approver_role", "auto_mode_allowed"],
    )

    organizations_writer.writerow(
        {
            "org_id": 1,
            "org_name": "Delivra India",
            "industry": "Quick Commerce",
            "country": "India",
            "currency_code": "INR",
            "timezone": "Asia/Kolkata",
        }
    )
    counts["organizations.csv"] += 1

    cities: list[dict] = []
    stores: list[dict] = []
    city_by_id: dict[int, dict] = {}
    store_by_id: dict[int, dict] = {}
    store_ids_by_city: dict[int, list[int]] = defaultdict(list)
    city_id = 1
    store_id = 1
    for city_cfg in CITY_CONFIGS:
        city = {
            "city_id": city_id,
            "city_name": city_cfg["name"],
            "tier": city_cfg["tier"],
            "state": city_cfg["state"],
            "population_bucket": city_cfg["population_bucket"],
            "rain_risk_score": city_cfg["rain_risk_score"],
            "traffic_risk_score": city_cfg["traffic_risk_score"],
            "demand_multiplier": city_cfg["demand_multiplier"],
            "lat": city_cfg["lat"],
            "lon": city_cfg["lon"],
        }
        cities.append(city)
        city_by_id[city_id] = city_cfg | city
        cities_writer.writerow({key: city[key] for key in ["city_id", "city_name", "tier", "state", "population_bucket", "rain_risk_score", "traffic_risk_score", "demand_multiplier"]})
        counts["cities.csv"] += 1
        for index in range(city_cfg["store_count"]):
            store = build_store(city_cfg, city_id, index, store_id, rng)
            stores.append(store)
            store_by_id[store_id] = store
            store_ids_by_city[city_id].append(store_id)
            stores_writer.writerow({key: store[key] for key in ["store_id", "org_id", "city_id", "store_name", "micro_market", "latitude", "longitude", "opening_hour", "closing_hour", "daily_order_capacity", "pick_capacity_per_hour", "inventory_slot_capacity", "cold_storage_capacity_units", "active_flag"]})
            counts["dark_stores.csv"] += 1
            store_id += 1
        city_id += 1

    teams: list[dict] = []
    teams_by_type_store: dict[tuple[int, str], int] = {}
    teams_by_type_city: dict[tuple[int, str], int] = {}
    team_manager_role: dict[int, str] = {}
    team_id = 1

    def add_team(city_ref: int | None, store_ref: int | None, name: str, team_type: str, parent_team_id: int | None, escalation_level: int, manager_role: str) -> int:
        nonlocal team_id
        row = {
            "team_id": team_id,
            "org_id": 1,
            "city_id": city_ref or "",
            "store_id": store_ref or "",
            "team_name": name,
            "team_type": team_type,
            "parent_team_id": parent_team_id or "",
            "manager_employee_id": "",
            "slack_channel": f"#{team_type.replace('_', '-')}-{(store_ref or city_ref or 1)}",
            "escalation_level": escalation_level,
        }
        teams.append(row)
        team_manager_role[team_id] = manager_role
        current_id = team_id
        team_id += 1
        return current_id

    regional_team_id = add_team(None, None, "Regional Command", "regional_command", None, 1, "regional_ops_head")
    procurement_team_id = add_team(None, None, "Procurement Control", "procurement", regional_team_id, 1, "procurement_manager")
    finance_team_id = add_team(None, None, "Finance Control Tower", "finance_control", regional_team_id, 1, "finance_controller")

    for city in cities:
        city_ops_id = add_team(city["city_id"], None, f"{city['city_name']} City Ops", "city_ops", regional_team_id, 2, "city_ops_manager")
        escalation_id = add_team(city["city_id"], None, f"{city['city_name']} Escalations", "customer_escalations", city_ops_id, 3, "escalations_manager")
        teams_by_type_city[(city["city_id"], "city_ops")] = city_ops_id
        teams_by_type_city[(city["city_id"], "customer_escalations")] = escalation_id

    for store in stores:
        city_ops_id = teams_by_type_city[(store["city_id"], "city_ops")]
        dark_store_ops_id = add_team(store["city_id"], store["store_id"], f"{store['store_name']} Store Ops", "dark_store_ops", city_ops_id, 3, "dark_store_manager")
        inventory_team_id = add_team(store["city_id"], store["store_id"], f"{store['store_name']} Inventory", "inventory_control", dark_store_ops_id, 3, "inventory_lead")
        fleet_team_id = add_team(store["city_id"], store["store_id"], f"{store['store_name']} Fleet", "fleet_ops", city_ops_id, 3, "fleet_manager")
        teams_by_type_store[(store["store_id"], "dark_store_ops")] = dark_store_ops_id
        teams_by_type_store[(store["store_id"], "inventory_control")] = inventory_team_id
        teams_by_type_store[(store["store_id"], "fleet_ops")] = fleet_team_id

    employees: list[dict] = []
    employee_id = 1
    managers_by_team: dict[int, int] = {}
    staff_pools: dict[tuple[int, str], list[int]] = defaultdict(list)

    def add_employee(team_ref: int, city_ref: int | None, store_ref: int | None, role: str, manager_employee_id: int | None, employment_type: str, shift_type: str, salary_range: tuple[int, int], productivity_range: tuple[float, float], attendance_range: tuple[float, float]) -> int:
        nonlocal employee_id
        employee = {
            "employee_id": employee_id,
            "org_id": 1,
            "team_id": team_ref,
            "store_id": store_ref or "",
            "city_id": city_ref or "",
            "employee_name": fake.name(),
            "role": role,
            "manager_employee_id": manager_employee_id or "",
            "employment_type": employment_type,
            "shift_type": shift_type,
            "tenure_months": rng.randint(1, 52),
            "base_monthly_salary_inr": rng.randint(*salary_range),
            "productivity_score": round(rng.uniform(*productivity_range), 2),
            "attendance_risk_score": round(rng.uniform(*attendance_range), 2),
            "active_flag": "true",
        }
        employees.append(employee)
        employees_writer.writerow(employee)
        counts["employees.csv"] += 1
        current_id = employee_id
        employee_id += 1
        return current_id

    regional_head = add_employee(regional_team_id, None, None, "regional_ops_head", None, "full_time", "day", (180000, 280000), (0.95, 1.18), (0.02, 0.09))
    managers_by_team[regional_team_id] = regional_head
    for team_ref in [procurement_team_id, finance_team_id]:
        role = team_manager_role[team_ref]
        manager = add_employee(team_ref, None, None, role, regional_head, "full_time", "day", (90000, 170000), (0.9, 1.15), (0.03, 0.1))
        managers_by_team[team_ref] = manager
        for staff_role in (["procurement_analyst"] if team_ref == procurement_team_id else ["finance_analyst"]):
            for _ in range(5):
                add_employee(team_ref, None, None, staff_role, manager, "full_time", "day", (35000, 68000), (0.78, 1.08), (0.04, 0.14))

    for city in cities:
        city_ops_team = teams_by_type_city[(city["city_id"], "city_ops")]
        esc_team = teams_by_type_city[(city["city_id"], "customer_escalations")]
        city_ops_manager = add_employee(city_ops_team, city["city_id"], None, "city_ops_manager", regional_head, "full_time", "day", (95000, 165000), (0.92, 1.14), (0.03, 0.11))
        esc_manager = add_employee(esc_team, city["city_id"], None, "escalations_manager", city_ops_manager, "full_time", "day", (70000, 120000), (0.88, 1.1), (0.04, 0.12))
        managers_by_team[city_ops_team] = city_ops_manager
        managers_by_team[esc_team] = esc_manager
        for _ in range(rng.randint(4, 7)):
            add_employee(city_ops_team, city["city_id"], None, "city_ops_analyst", city_ops_manager, "full_time", "day", (38000, 68000), (0.8, 1.08), (0.04, 0.14))
        for _ in range(rng.randint(6, 10)):
            add_employee(esc_team, city["city_id"], None, "escalation_specialist", esc_manager, "full_time", rng.choice(["day", "swing"]), (28000, 52000), (0.78, 1.05), (0.05, 0.16))

    for store in stores:
        city_ref = store["city_id"]
        dark_team = teams_by_type_store[(store["store_id"], "dark_store_ops")]
        inv_team = teams_by_type_store[(store["store_id"], "inventory_control")]
        fleet_team = teams_by_type_store[(store["store_id"], "fleet_ops")]
        city_ops_manager = managers_by_team[teams_by_type_city[(city_ref, "city_ops")]]

        store_manager = add_employee(dark_team, city_ref, store["store_id"], "dark_store_manager", city_ops_manager, "full_time", "day", (42000, 76000), (0.9, 1.15), (0.03, 0.12))
        inventory_lead = add_employee(inv_team, city_ref, store["store_id"], "inventory_lead", store_manager, "full_time", "day", (32000, 52000), (0.85, 1.1), (0.03, 0.11))
        fleet_manager = add_employee(fleet_team, city_ref, store["store_id"], "fleet_manager", city_ops_manager, "full_time", "day", (36000, 62000), (0.84, 1.1), (0.04, 0.12))
        managers_by_team[dark_team] = store_manager
        managers_by_team[inv_team] = inventory_lead
        managers_by_team[fleet_team] = fleet_manager

        for _ in range(2):
            shift_lead = add_employee(dark_team, city_ref, store["store_id"], "shift_lead", store_manager, "full_time", rng.choice(["morning", "evening"]), (24000, 38000), (0.82, 1.08), (0.05, 0.14))
            staff_pools[(store["store_id"], "shift_lead")].append(shift_lead)

        size = store["store_size"]
        picker_count = {"small": (6, 9), "medium": (10, 15), "large": (15, 22)}[size]
        packer_count = {"small": (4, 7), "medium": (7, 11), "large": (11, 16)}[size]
        inventory_count = {"small": (2, 4), "medium": (3, 5), "large": (4, 7)}[size]
        for _ in range(rng.randint(*picker_count)):
            picker_id = add_employee(dark_team, city_ref, store["store_id"], "picker", store_manager, rng.choice(["full_time", "contract"]), rng.choice(["morning", "evening"]), (16000, 24000), (0.72, 1.1), (0.05, 0.2))
            staff_pools[(store["store_id"], "picker")].append(picker_id)
        for _ in range(rng.randint(*packer_count)):
            packer_id = add_employee(dark_team, city_ref, store["store_id"], "packer", store_manager, rng.choice(["full_time", "contract"]), rng.choice(["morning", "evening"]), (16000, 24000), (0.72, 1.1), (0.05, 0.2))
            staff_pools[(store["store_id"], "packer")].append(packer_id)
        for _ in range(rng.randint(*inventory_count)):
            inventory_id = add_employee(inv_team, city_ref, store["store_id"], "inventory_associate", inventory_lead, rng.choice(["full_time", "contract"]), rng.choice(["morning", "evening"]), (18000, 26000), (0.75, 1.08), (0.04, 0.16))
            staff_pools[(store["store_id"], "inventory_associate")].append(inventory_id)

    # Backfill team manager ids by rewriting the file later from in-memory teams.
    for team in teams:
        team["manager_employee_id"] = managers_by_team.get(team["team_id"], "")

    teams_writer = writer.open(
        "teams.csv",
        ["team_id", "org_id", "city_id", "store_id", "team_name", "team_type", "parent_team_id", "manager_employee_id", "slack_channel", "escalation_level"],
    )
    counts["teams.csv"] = 0
    for team in teams:
        teams_writer.writerow(team)
        counts["teams.csv"] += 1

    drivers: list[dict] = []
    driver_ids_by_store: dict[int, list[int]] = defaultdict(list)
    driver_id = 1
    for store in stores:
        size = store["store_size"]
        driver_count = {"small": (14, 22), "medium": (22, 34), "large": (32, 46)}[size]
        for _ in range(rng.randint(*driver_count)):
            employment_mode = weighted_choice(rng, EMPLOYMENT_MODES)
            driver = {
                "driver_id": driver_id,
                "org_id": 1,
                "city_id": store["city_id"],
                "primary_store_id": store["store_id"],
                "fleet_team_id": teams_by_type_store[(store["store_id"], "fleet_ops")],
                "driver_name": fake.name(),
                "vehicle_type": weighted_choice(rng, VEHICLE_TYPES),
                "employment_mode": employment_mode,
                "tenure_months": rng.randint(1, 36),
                "rating": round(bounded_gauss(rng, 4.49 if employment_mode != "partner" else 4.32, 0.18, 3.6, 4.95), 2),
                "acceptance_rate": round(bounded_gauss(rng, 0.91, 0.05, 0.72, 0.99), 2),
                "on_time_rate": round(bounded_gauss(rng, 0.87, 0.06, 0.68, 0.98), 2),
                "daily_order_capacity": rng.randint(14, 32),
                "attendance_risk_score": round(rng.uniform(0.03, 0.22 if employment_mode == "partner" else 0.14), 2),
                "active_flag": "true",
            }
            drivers.append(driver)
            driver_ids_by_store[store["store_id"]].append(driver_id)
            drivers_writer.writerow(driver)
            counts["drivers.csv"] += 1
            driver_id += 1

    vendors: list[dict] = []
    contract_rows: list[dict] = []
    vendor_id = 1
    contract_id = 1
    for vendor_name, category, city_scope, risk_rating, billing_cycle, payment_terms in VENDORS:
        vendor = {
            "vendor_id": vendor_id,
            "org_id": 1,
            "vendor_name": vendor_name,
            "vendor_category": category,
            "city_scope": city_scope,
            "risk_rating": round(risk_rating, 2),
            "billing_cycle": billing_cycle,
            "payment_terms_days": payment_terms,
        }
        vendors.append(vendor)
        vendors_writer.writerow(vendor)
        counts["vendors.csv"] += 1

        if category == "last_mile_partner":
            contract_type, service_unit, rate_range, penalty, response, resolution, auto = ("last_mile_service", "completed_drop", (33, 46), 95000, 1, 6, "true")
        elif category == "packaging_supplier":
            contract_type, service_unit, rate_range, penalty, response, resolution, auto = ("procurement", "order_pack", (4, 8), 30000, 4, 24, "false")
        elif category == "cold_chain_supplier":
            contract_type, service_unit, rate_range, penalty, response, resolution, auto = ("cold_chain", "crate_day", (22, 42), 85000, 2, 8, "false")
        elif category == "staffing_agency":
            contract_type, service_unit, rate_range, penalty, response, resolution, auto = ("staffing", "shift", (780, 1280), 40000, 8, 24, "false")
        else:
            contract_type, service_unit, rate_range, penalty, response, resolution, auto = ("saas", "active_seat", (240, 420), 15000, 24, 72, "false")

        contract = {
            "contract_id": contract_id,
            "org_id": 1,
            "vendor_id": vendor_id,
            "contract_type": contract_type,
            "service_unit": service_unit,
            "contracted_rate_inr": round(rng.uniform(*rate_range), 2),
            "rate_tolerance_pct": rng.choice([5, 8, 10]),
            "start_date": str(start_date - timedelta(days=120)),
            "end_date": str(start_date + timedelta(days=365)),
            "sla_name": f"{vendor_name} Operational SLA",
            "response_deadline_hours": response,
            "resolution_deadline_hours": resolution,
            "penalty_per_breach_inr": penalty,
            "auto_action_allowed": auto,
        }
        contract_rows.append(contract)
        contracts_writer.writerow(contract)
        counts["contracts.csv"] += 1
        contract_id += 1
        vendor_id += 1

    contract_by_vendor = {item["vendor_id"]: item for item in contract_rows}
    vendors_by_category: dict[str, list[dict]] = defaultdict(list)
    for item in vendors:
        vendors_by_category[item["vendor_category"]].append(item)

    daily_contexts: dict[tuple[int, date], DailyStoreContext] = {}
    inventory_snapshot_id = 1
    for offset in range(days):
        current_date = start_date + timedelta(days=offset)
        weekday = current_date.weekday()
        weekend_multiplier = 1.12 if weekday in {4, 5, 6} else 0.94 if weekday == 1 else 1.0
        for store in stores:
            city = city_by_id[store["city_id"]]
            rain_flag = rng.random() < city["rain_risk_score"] * (1.45 if current_date.month in {6, 7, 8, 9} else 0.8)
            surge_flag = rng.random() < (0.18 if weekday in {4, 5, 6} else 0.08)
            size = store["store_size"]
            planned_pickers = {"small": 6, "medium": 10, "large": 14}[size] + rng.randint(0, 4)
            planned_packers = {"small": 4, "medium": 7, "large": 10}[size] + rng.randint(0, 3)
            planned_drivers = {"small": 16, "medium": 24, "large": 34}[size] + rng.randint(0, 8)
            severe_driver_shortage = rng.random() < 0.045
            severe_staff_shortage = rng.random() < 0.052
            cold_chain_risk = rng.random() < 0.018
            underused_store = rng.random() < 0.09 and city["demand_multiplier"] < 1.0
            peak_delay_cluster = severe_driver_shortage or severe_staff_shortage or (rain_flag and surge_flag)

            present_pickers = max(2, planned_pickers - rng.randint(1, 4 if severe_staff_shortage else 2))
            present_packers = max(2, planned_packers - rng.randint(1, 4 if severe_staff_shortage else 2))
            active_drivers = max(4, planned_drivers - rng.randint(3, 8 if severe_driver_shortage else 4))
            dispatch_bays = {"small": 3, "medium": 5, "large": 7}[size]
            active_dispatch_bays = max(2, dispatch_bays - (1 if peak_delay_cluster and rng.random() < 0.4 else 0))
            cold_storage_units = store["cold_storage_capacity_units"]
            active_cold_storage_units = int(cold_storage_units * rng.uniform(0.58, 0.92))
            if cold_chain_risk:
                active_cold_storage_units = int(cold_storage_units * rng.uniform(0.96, 1.08))
            saas_licenses = planned_pickers + planned_packers + 6
            active_saas_licenses = int(saas_licenses * rng.uniform(0.18, 0.42)) if underused_store else int(saas_licenses * rng.uniform(0.62, 0.9))

            context = DailyStoreContext(
                date_value=current_date,
                store_id=store["store_id"],
                city_id=store["city_id"],
                rain_flag=rain_flag,
                surge_flag=surge_flag,
                peak_demand_multiplier=weekend_multiplier * city["demand_multiplier"] * (1.12 if rain_flag else 1.0) * (1.18 if surge_flag else 1.0),
                planned_pickers=planned_pickers,
                present_pickers=present_pickers,
                planned_packers=planned_packers,
                present_packers=present_packers,
                planned_drivers=planned_drivers,
                active_drivers=active_drivers,
                dispatch_bays=dispatch_bays,
                active_dispatch_bays=active_dispatch_bays,
                cold_storage_units=cold_storage_units,
                active_cold_storage_units=active_cold_storage_units,
                saas_licenses=saas_licenses,
                active_saas_licenses=active_saas_licenses,
                severe_driver_shortage=severe_driver_shortage,
                severe_staff_shortage=severe_staff_shortage,
                cold_chain_risk=cold_chain_risk,
                underused_store=underused_store,
                peak_delay_cluster=peak_delay_cluster,
            )
            daily_contexts[(store["store_id"], current_date)] = context

            snapshot_ts = datetime.combine(current_date, time(hour=7, minute=rng.randint(2, 44), tzinfo=IST))
            resources = [
                ("picker_capacity", "Picker Capacity", present_pickers, planned_pickers, 225000 + planned_pickers * 12000, present_pickers, planned_pickers),
                ("packer_capacity", "Packer Capacity", present_packers, planned_packers, 182000 + planned_packers * 9000, present_packers, planned_packers),
                ("driver_capacity", "Driver Capacity", active_drivers, planned_drivers, 398000 + planned_drivers * 8000, active_drivers, planned_drivers),
                ("dispatch_bays", "Dispatch Bays", active_dispatch_bays, dispatch_bays, 82000 + dispatch_bays * 16000, active_drivers, planned_drivers),
                ("cold_storage", "Cold Storage", active_cold_storage_units, cold_storage_units, 134000 + cold_storage_units * 260, present_pickers + present_packers, planned_pickers + planned_packers),
                ("saas_licenses", "Operations SaaS Seats", active_saas_licenses, saas_licenses, 45000 + saas_licenses * 310, present_pickers + present_packers, planned_pickers + planned_packers),
            ]
            for resource_type, resource_name, active_units, provisioned_units, monthly_cost, staff_present, staff_planned in resources:
                utilization_pct = round((active_units / max(provisioned_units, 1)) * 100, 2)
                inventory_writer.writerow(
                    {
                        "snapshot_id": inventory_snapshot_id,
                        "snapshot_ts": to_iso(snapshot_ts),
                        "store_id": store["store_id"],
                        "city_id": store["city_id"],
                        "resource_type": resource_type,
                        "resource_name": f"{store['store_name']} {resource_name}",
                        "active_units": active_units,
                        "provisioned_units": provisioned_units,
                        "utilization_pct": utilization_pct,
                        "monthly_cost_inr": round(monthly_cost, 2),
                        "shift_staff_present": staff_present,
                        "shift_staff_planned": staff_planned,
                    }
                )
                counts["inventory_snapshots.csv"] += 1
                inventory_snapshot_id += 1

    order_id = 1
    order_item_id = 1
    delivery_event_id = 1
    delayed_order_samples: list[dict] = []
    store_week_metrics: dict[tuple[int, int], dict[str, float]] = defaultdict(lambda: defaultdict(float))

    hours = list(HOURLY_WEIGHTS.keys())
    hour_weights = list(HOURLY_WEIGHTS.values())

    for offset in range(days):
        current_date = start_date + timedelta(days=offset)
        for store in stores:
            city = city_by_id[store["city_id"]]
            context = daily_contexts[(store["store_id"], current_date)]
            base_orders = store["base_demand"]
            noise_multiplier = bounded_gauss(rng, 1.0, 0.08, 0.78, 1.25)
            if context.underused_store:
                noise_multiplier *= rng.uniform(0.58, 0.76)
            daily_orders = int(base_orders * context.peak_demand_multiplier * noise_multiplier)
            daily_orders = max(90, min(daily_orders, store["daily_order_capacity"]))
            context.total_orders = daily_orders

            picker_ids = staff_pools[(store["store_id"], "picker")]
            packer_ids = staff_pools[(store["store_id"], "packer")]
            drivers_for_store = driver_ids_by_store[store["store_id"]]
            weekly_bucket = ((current_date - start_date).days // 7) + 1

            for _ in range(daily_orders):
                hour = rng.choices(hours, weights=hour_weights, k=1)[0]
                minute = rng.randint(0, 59)
                second = rng.randint(0, 59)
                order_ts = datetime.combine(current_date, time(hour=hour, minute=minute, second=second, tzinfo=IST))
                peak_flag = hour in {12, 13, 18, 19, 20, 21}
                promised_eta = int(bounded_gauss(rng, 12.5 if city["tier"] == "metro" else 14.0, 2.6, 8, 24))
                distance_km = round(bounded_gauss(rng, 2.5, 1.1, 0.4, 6.8), 2)
                item_count = max(1, int(round(bounded_gauss(rng, 6.2, 2.1, 1, 28))))
                avg_item_value = bounded_gauss(rng, 72, 28, 18, 290)
                basket_value = round(item_count * avg_item_value * rng.uniform(0.88, 1.16), 2)
                if rng.random() < 0.06:
                    basket_value *= rng.uniform(1.4, 2.3)
                basket_value = round(min(max(basket_value, 90), 1850), 2)
                discount_value = round(basket_value * rng.uniform(0.0, 0.16 if peak_flag else 0.09), 2)
                delivery_fee = round(0 if basket_value > 399 else rng.choice([9, 12, 15, 18]), 2)
                payment_method = weighted_choice(rng, PAYMENT_METHODS)
                assigned_driver_id = rng.choice(drivers_for_store)
                picker_employee_id = rng.choice(picker_ids) if picker_ids else ""
                packer_employee_id = rng.choice(packer_ids) if packer_ids else ""

                delay = rng.uniform(-2.0, 3.0)
                if peak_flag:
                    delay += rng.uniform(0.5, 3.5)
                if context.rain_flag:
                    delay += rng.uniform(0.4, 4.2)
                if context.severe_driver_shortage:
                    delay += rng.uniform(2.5, 8.5)
                if context.severe_staff_shortage:
                    delay += rng.uniform(1.2, 6.0)
                if context.peak_delay_cluster and peak_flag:
                    delay += rng.uniform(2.0, 7.0)
                delay += max(distance_km - 2.2, 0) * rng.uniform(0.2, 1.4)
                actual_minutes = max(6, int(round(promised_eta + delay)))
                cancelled = rng.random() < (0.02 if actual_minutes >= promised_eta + 15 else 0.004)
                order_status = "cancelled" if cancelled else "delivered"
                if cancelled:
                    context.cancelled_orders += 1
                    context.late_orders += 1
                    actual_minutes = max(actual_minutes, promised_eta + rng.randint(8, 18))
                else:
                    context.delivered_orders += 1
                    if actual_minutes > promised_eta + 8:
                        context.late_orders += 1

                context.gross_basket_value += basket_value
                context.total_delivery_minutes += actual_minutes
                store_week_metrics[(store["store_id"], weekly_bucket)]["orders"] += 1
                store_week_metrics[(store["store_id"], weekly_bucket)]["basket_value"] += basket_value
                store_week_metrics[(store["store_id"], weekly_bucket)]["late_orders"] += 1 if actual_minutes > promised_eta + 8 else 0

                orders_writer.writerow(
                    {
                        "order_id": order_id,
                        "org_id": 1,
                        "city_id": store["city_id"],
                        "store_id": store["store_id"],
                        "customer_id_hash": stable_customer_id(order_id),
                        "order_ts": to_iso(order_ts),
                        "promised_eta_minutes": promised_eta,
                        "actual_delivery_minutes": actual_minutes,
                        "basket_value_inr": round(basket_value, 2),
                        "discount_value_inr": round(discount_value, 2),
                        "delivery_fee_inr": round(delivery_fee, 2),
                        "payment_method": payment_method,
                        "order_status": order_status,
                        "item_count": item_count,
                        "distance_km": distance_km,
                        "assigned_driver_id": assigned_driver_id,
                        "picker_employee_id": picker_employee_id,
                        "packer_employee_id": packer_employee_id,
                        "peak_flag": "true" if peak_flag else "false",
                        "rain_flag": "true" if context.rain_flag else "false",
                        "surge_flag": "true" if context.surge_flag else "false",
                    }
                )
                counts["orders.csv"] += 1

                line_count = min(item_count, rng.randint(1, min(6, item_count)))
                quantities = allocate_counts(item_count, line_count, rng)
                for quantity in quantities:
                    sku_id = rng.randint(1000, 9999)
                    sku_name, category, mrp, procurement_cost = rng.choice(SKU_CATALOG)
                    substituted = rng.random() < (0.035 if context.severe_staff_shortage or context.rain_flag else 0.012)
                    fulfilled = not cancelled and rng.random() >= (0.028 if context.peak_delay_cluster else 0.01)
                    selling_price = round(mrp * rng.uniform(0.8, 0.97), 2)
                    order_items_writer.writerow(
                        {
                            "order_item_id": order_item_id,
                            "order_id": order_id,
                            "sku_id": sku_id,
                            "sku_name": sku_name,
                            "category": category,
                            "quantity": quantity,
                            "mrp_inr": mrp,
                            "selling_price_inr": selling_price,
                            "procurement_cost_inr": procurement_cost,
                            "substituted_flag": "true" if substituted else "false",
                            "fulfilled_flag": "true" if fulfilled else "false",
                        }
                    )
                    counts["order_items.csv"] += 1
                    order_item_id += 1

                delay_reason = ""
                if actual_minutes > promised_eta + 8 or cancelled:
                    reasons = []
                    if context.rain_flag:
                        reasons.append("rain")
                    if city["traffic_risk_score"] > 0.7:
                        reasons.append("traffic")
                    if context.severe_driver_shortage:
                        reasons.append("rider_shortage")
                    if context.severe_staff_shortage:
                        reasons.append("store_backlog")
                    if rng.random() < 0.08:
                        reasons.append("inventory_substitution")
                    delay_reason = rng.choice(reasons) if reasons else ""

                picked_at = order_ts + timedelta(minutes=rng.uniform(1.5, 6.0 if not context.severe_staff_shortage else 11.0))
                packed_at = picked_at + timedelta(minutes=rng.uniform(1.0, 4.0 if not context.severe_staff_shortage else 7.0))
                driver_assigned_at = packed_at + timedelta(minutes=rng.uniform(0.2, 2.2 if not context.severe_driver_shortage else 7.0))
                dispatched_at = driver_assigned_at + timedelta(minutes=rng.uniform(0.2, 2.0))
                handoff_at = order_ts + timedelta(minutes=max(actual_minutes - rng.uniform(0.8, 2.5), promised_eta * 0.6))
                delivered_at = order_ts + timedelta(minutes=actual_minutes)
                events = [
                    ("order_placed", order_ts, 0, distance_km, ""),
                    ("picker_assigned", order_ts + timedelta(minutes=rng.uniform(0.1, 1.0)), 1, distance_km, ""),
                    ("picked", picked_at, 2, distance_km, ""),
                    ("packed", packed_at, 3, distance_km, ""),
                    ("driver_assigned", driver_assigned_at, 4, distance_km, ""),
                    ("dispatched", dispatched_at, 5, distance_km, delay_reason if delay_reason and rng.random() < 0.25 else ""),
                    ("customer_handoff", handoff_at, 6, distance_km, delay_reason if delay_reason and rng.random() < 0.5 else ""),
                    ("delivered", delivered_at, 7, distance_km, delay_reason),
                ]
                for event_type, event_ts, sequence, gps_distance, reason in events:
                    delivery_writer.writerow(
                        {
                            "event_id": delivery_event_id,
                            "order_id": order_id,
                            "driver_id": assigned_driver_id,
                            "store_id": store["store_id"],
                            "event_type": event_type,
                            "event_ts": to_iso(event_ts),
                            "event_sequence": sequence,
                            "gps_distance_km": round(gps_distance, 2),
                            "delay_reason": reason,
                        }
                    )
                    counts["delivery_events.csv"] += 1
                    delivery_event_id += 1

                if actual_minutes > promised_eta + 10 or cancelled:
                    if len(delayed_order_samples) < 8000 or rng.random() < 0.08:
                        delayed_order_samples.append(
                            {
                                "order_id": order_id,
                                "store_id": store["store_id"],
                                "city_id": store["city_id"],
                                "date": current_date,
                                "delay_minutes": actual_minutes - promised_eta,
                                "cancelled": cancelled,
                                "basket_value": basket_value,
                                "delay_reason": delay_reason or "delivery_delay",
                            }
                        )
                order_id += 1

    work_item_id = 1
    selected_late_samples = rng.sample(delayed_order_samples, k=min(len(delayed_order_samples), max(450, len(delayed_order_samples) // 6)))
    for sample in selected_late_samples:
        team_type = "customer_escalations" if sample["cancelled"] else "fleet_ops"
        team_id_ref = (
            teams_by_type_city[(sample["city_id"], "customer_escalations")]
            if team_type == "customer_escalations"
            else teams_by_type_store[(sample["store_id"], "fleet_ops")]
        )
        opened_at = datetime.combine(sample["date"], time(hour=12, minute=rng.randint(0, 45), tzinfo=IST))
        expected_by = opened_at + timedelta(hours=2 if not sample["cancelled"] else 1)
        unresolved_allowed = sample["date"] >= recent_open_cutoff
        resolved_at = None if unresolved_allowed and rng.random() < 0.42 else expected_by + timedelta(minutes=rng.randint(12, 210))
        status = "open" if resolved_at is None else "resolved"
        item_type = "delivery_exception" if not sample["cancelled"] else "customer_escalation"
        priority = "P1" if sample["delay_minutes"] > 24 or sample["cancelled"] else "P2"
        backlog_hours = round(max(sample["delay_minutes"] / 60, 0.5), 2)
        estimated_value = round(sample["basket_value"] * rng.uniform(0.65, 1.4), 2)
        work_items_writer.writerow(
            {
                "work_item_id": work_item_id,
                "org_id": 1,
                "city_id": sample["city_id"],
                "store_id": sample["store_id"],
                "team_id": team_id_ref,
                "item_type": item_type,
                "priority": priority,
                "opened_at": to_iso(opened_at),
                "expected_by": to_iso(expected_by),
                "resolved_at": to_iso(resolved_at) if resolved_at else "",
                "status": status,
                "estimated_value_inr": estimated_value,
                "backlog_hours": backlog_hours,
                "linked_order_id": sample["order_id"],
                "linked_vendor_id": "",
            }
        )
        counts["work_items.csv"] += 1
        if priority == "P1" or status == "open":
            anomaly_counter["driver_shortage_peak_window"] += 1
            anomalies_writer.writerow(
                {
                    "anomaly_id": f"A-{work_item_id}",
                    "entity_type": "work_item",
                    "entity_id": work_item_id,
                    "anomaly_type": "driver_shortage_peak_window",
                    "module": "SLA Sentinel",
                    "severity": "critical" if sample["cancelled"] else "high",
                    "start_ts": to_iso(opened_at),
                    "end_ts": to_iso(resolved_at) if resolved_at else "",
                    "projected_impact_inr": round(estimated_value * 1.2, 2),
                    "realized_impact_inr": round(estimated_value * rng.uniform(0.28, 0.74), 2) if resolved_at else "",
                    "formula_name": "driver_shortage_loss",
                    "formula_inputs_json": json.dumps(
                        {
                            "delay_minutes": sample["delay_minutes"],
                            "basket_value_inr": sample["basket_value"],
                            "cancelled": sample["cancelled"],
                            "reason": sample["delay_reason"],
                        }
                    ),
                    "root_cause": "Driver capacity fell short during a peak or disrupted delivery window.",
                    "recommended_action": "reroute_fleet_capacity",
                    "required_team_type": "fleet_ops",
                    "required_role": "fleet_manager",
                    "expected_approver_role": "city_ops_manager",
                }
            )
            counts["ground_truth_anomalies.csv"] += 1
        work_item_id += 1

    # Store/day operational work items from resource conditions.
    for context in daily_contexts.values():
        store = store_by_id[context.store_id]
        if context.severe_staff_shortage or context.peak_delay_cluster:
            opened_at = datetime.combine(context.date_value, time(hour=10, minute=rng.randint(0, 50), tzinfo=IST))
            expected_by = opened_at + timedelta(hours=6)
            unresolved_allowed = context.date_value >= recent_open_cutoff
            resolved = None if unresolved_allowed and rng.random() < 0.35 else opened_at + timedelta(hours=rng.uniform(2.5, 9.0))
            work_items_writer.writerow(
                {
                    "work_item_id": work_item_id,
                    "org_id": 1,
                    "city_id": context.city_id,
                    "store_id": context.store_id,
                    "team_id": teams_by_type_store[(context.store_id, "dark_store_ops")],
                    "item_type": "store_incident",
                    "priority": "P1" if context.severe_staff_shortage else "P2",
                    "opened_at": to_iso(opened_at),
                    "expected_by": to_iso(expected_by),
                    "resolved_at": to_iso(resolved) if resolved else "",
                    "status": "open" if resolved is None else "resolved",
                    "estimated_value_inr": round(store["base_demand"] * rng.uniform(18, 36), 2),
                    "backlog_hours": round(rng.uniform(2.2, 11.6), 2),
                    "linked_order_id": "",
                    "linked_vendor_id": "",
                }
            )
            counts["work_items.csv"] += 1
            anomaly_counter["warehouse_pick_backlog"] += 1
            anomalies_writer.writerow(
                {
                    "anomaly_id": f"A-{work_item_id}",
                    "entity_type": "work_item",
                    "entity_id": work_item_id,
                    "anomaly_type": "warehouse_pick_backlog",
                    "module": "SLA Sentinel",
                    "severity": "high" if context.severe_staff_shortage else "medium",
                    "start_ts": to_iso(opened_at),
                    "end_ts": to_iso(resolved) if resolved else "",
                    "projected_impact_inr": round(store["base_demand"] * rng.uniform(34, 58), 2),
                    "realized_impact_inr": round(store["base_demand"] * rng.uniform(8, 24), 2) if resolved else "",
                    "formula_name": "sla_penalty",
                    "formula_inputs_json": json.dumps(
                        {
                            "planned_pickers": context.planned_pickers,
                            "present_pickers": context.present_pickers,
                            "planned_packers": context.planned_packers,
                            "present_packers": context.present_packers,
                        }
                    ),
                    "root_cause": "Store staffing fell behind required picking and packing load during an active demand window.",
                    "recommended_action": "shift_store_staffing",
                    "required_team_type": "dark_store_ops",
                    "required_role": "dark_store_manager",
                    "expected_approver_role": "city_ops_manager",
                }
            )
            counts["ground_truth_anomalies.csv"] += 1
            work_item_id += 1

        if context.cold_chain_risk:
            opened_at = datetime.combine(context.date_value, time(hour=8, minute=rng.randint(5, 52), tzinfo=IST))
            expected_by = opened_at + timedelta(hours=3)
            unresolved_allowed = context.date_value >= recent_open_cutoff
            resolved = None if unresolved_allowed and rng.random() < 0.28 else opened_at + timedelta(hours=rng.uniform(1.2, 4.5))
            work_items_writer.writerow(
                {
                    "work_item_id": work_item_id,
                    "org_id": 1,
                    "city_id": context.city_id,
                    "store_id": context.store_id,
                    "team_id": teams_by_type_store[(context.store_id, "inventory_control")],
                    "item_type": "cold_chain_issue",
                    "priority": "P1",
                    "opened_at": to_iso(opened_at),
                    "expected_by": to_iso(expected_by),
                    "resolved_at": to_iso(resolved) if resolved else "",
                    "status": "open" if resolved is None else "resolved",
                    "estimated_value_inr": round(rng.uniform(22000, 78000), 2),
                    "backlog_hours": round(rng.uniform(0.8, 4.2), 2),
                    "linked_order_id": "",
                    "linked_vendor_id": "",
                }
            )
            counts["work_items.csv"] += 1
            anomaly_counter["cold_chain_breach_risk"] += 1
            anomalies_writer.writerow(
                {
                    "anomaly_id": f"A-{work_item_id}",
                    "entity_type": "work_item",
                    "entity_id": work_item_id,
                    "anomaly_type": "cold_chain_breach_risk",
                    "module": "SLA Sentinel",
                    "severity": "high",
                    "start_ts": to_iso(opened_at),
                    "end_ts": to_iso(resolved) if resolved else "",
                    "projected_impact_inr": round(rng.uniform(28000, 92000), 2),
                    "realized_impact_inr": round(rng.uniform(6000, 32000), 2) if resolved else "",
                    "formula_name": "cold_chain_loss",
                    "formula_inputs_json": json.dumps(
                        {
                            "cold_storage_units": context.cold_storage_units,
                            "active_cold_storage_units": context.active_cold_storage_units,
                        }
                    ),
                    "root_cause": "Cold storage or perishables handling exceeded safe operational thresholds.",
                    "recommended_action": "escalate_cold_chain_incident",
                    "required_team_type": "inventory_control",
                    "required_role": "inventory_lead",
                    "expected_approver_role": "city_ops_manager",
                }
            )
            counts["ground_truth_anomalies.csv"] += 1
            work_item_id += 1

        if context.underused_store and rng.random() < 0.8:
            anomaly_counter["store_underuse"] += 1
            anomalies_writer.writerow(
                {
                    "anomaly_id": f"A-store-{context.store_id}-{context.date_value.isoformat()}",
                    "entity_type": "inventory_snapshot",
                    "entity_id": context.store_id,
                    "anomaly_type": "store_underuse",
                    "module": "SLA Sentinel",
                    "severity": "medium",
                    "start_ts": to_iso(datetime.combine(context.date_value, time(hour=7, tzinfo=IST))),
                    "end_ts": "",
                    "projected_impact_inr": round(rng.uniform(18000, 54000), 2),
                    "realized_impact_inr": "",
                    "formula_name": "capacity_waste",
                    "formula_inputs_json": json.dumps(
                        {
                            "active_saas_licenses": context.active_saas_licenses,
                            "saas_licenses": context.saas_licenses,
                        }
                    ),
                    "root_cause": "Store demand stayed materially below the fixed capacity and software seat baseline.",
                    "recommended_action": "review_store_consolidation",
                    "required_team_type": "regional_command",
                    "required_role": "regional_ops_head",
                    "expected_approver_role": "regional_ops_head",
                }
            )
            counts["ground_truth_anomalies.csv"] += 1

        if context.active_saas_licenses / max(context.saas_licenses, 1) < 0.38 and rng.random() < 0.85:
            anomaly_counter["saas_license_underuse"] += 1
            anomalies_writer.writerow(
                {
                    "anomaly_id": f"A-saas-{context.store_id}-{context.date_value.isoformat()}",
                    "entity_type": "inventory_snapshot",
                    "entity_id": context.store_id,
                    "anomaly_type": "saas_license_underuse",
                    "module": "ProcureWatch",
                    "severity": "low",
                    "start_ts": to_iso(datetime.combine(context.date_value, time(hour=7, tzinfo=IST))),
                    "end_ts": "",
                    "projected_impact_inr": round((context.saas_licenses - context.active_saas_licenses) * rng.uniform(220, 360), 2),
                    "realized_impact_inr": "",
                    "formula_name": "unused_capacity",
                    "formula_inputs_json": json.dumps(
                        {
                            "active_seats": context.active_saas_licenses,
                            "provisioned_seats": context.saas_licenses,
                        }
                    ),
                    "root_cause": "Provisioned operations software seats materially exceeded actual usage.",
                    "recommended_action": "reduce_unused_seats",
                    "required_team_type": "procurement",
                    "required_role": "procurement_manager",
                    "expected_approver_role": "finance_controller",
                }
            )
            counts["ground_truth_anomalies.csv"] += 1

    # Invoices generated after operational metrics are known.
    invoice_id = 1
    anomaly_id_counter = counts["ground_truth_anomalies.csv"] + 1
    invoice_rows: list[dict] = []

    for (store_ref, week_bucket), metrics in sorted(store_week_metrics.items()):
        store = store_by_id[store_ref]
        city_id_ref = store["city_id"]

        lm_vendor = rng.choice(vendors_by_category["last_mile_partner"])
        pack_vendor = rng.choice(vendors_by_category["packaging_supplier"])
        staffing_vendor = rng.choice(vendors_by_category["staffing_agency"])
        cold_vendor = rng.choice(vendors_by_category["cold_chain_supplier"])
        saas_vendor = rng.choice(vendors_by_category["software_saas"])
        vendor_set = [lm_vendor, pack_vendor, staffing_vendor, cold_vendor, saas_vendor]

        week_start = start_date + timedelta(days=(week_bucket - 1) * 7)
        week_end = min(week_start + timedelta(days=6), today)
        for vendor in vendor_set:
            contract = contract_by_vendor[vendor["vendor_id"]]
            category = vendor["vendor_category"]
            if category == "last_mile_partner":
                validated_units = int(metrics["orders"] * rng.uniform(0.72, 0.88))
                service_units = validated_units
            elif category == "packaging_supplier":
                validated_units = int(metrics["orders"] * rng.uniform(0.94, 1.02))
                service_units = validated_units
            elif category == "staffing_agency":
                validated_units = rng.randint(38, 78)
                service_units = validated_units
            elif category == "cold_chain_supplier":
                validated_units = rng.randint(92, 214)
                service_units = validated_units
            else:
                validated_units = rng.randint(18, 44)
                service_units = validated_units

            billed_rate = float(contract["contracted_rate_inr"])
            anomaly_type = None
            severity = None
            projected_impact = 0.0

            if category in {"packaging_supplier", "staffing_agency"} and rng.random() < 0.09:
                billed_rate = round(billed_rate * rng.uniform(1.08, 1.22), 2)
                anomaly_type = "contract_rate_drift"
                severity = "high"
                projected_impact = round((billed_rate - float(contract["contracted_rate_inr"])) * service_units, 2)
            elif category in {"last_mile_partner", "staffing_agency"} and rng.random() < 0.12:
                service_units = int(validated_units * rng.uniform(1.04, 1.18))
                anomaly_type = "validated_units_mismatch"
                severity = "medium"
                projected_impact = round((service_units - validated_units) * billed_rate, 2)

            amount = round(service_units * billed_rate, 2)
            invoice_ref = f"QB-{store_ref:03d}-{vendor['vendor_id']:02d}-W{week_bucket:02d}"
            row = {
                "invoice_id": invoice_id,
                "org_id": 1,
                "vendor_id": vendor["vendor_id"],
                "contract_id": contract["contract_id"],
                "store_id": store_ref,
                "city_id": city_id_ref,
                "invoice_ref": invoice_ref,
                "invoice_date": str(week_end),
                "billing_period_start": str(week_start),
                "billing_period_end": str(week_end),
                "service_unit_count": service_units,
                "validated_unit_count": validated_units,
                "billed_rate_inr": billed_rate,
                "contracted_rate_inr": contract["contracted_rate_inr"],
                "amount_inr": amount,
                "status": "open",
            }
            invoice_rows.append(row)
            invoices_writer.writerow(row)
            counts["invoices.csv"] += 1

            if anomaly_type:
                anomaly_counter[anomaly_type] += 1
                anomalies_writer.writerow(
                    {
                        "anomaly_id": f"A-{anomaly_id_counter}",
                        "entity_type": "invoice",
                        "entity_id": invoice_id,
                        "anomaly_type": anomaly_type,
                        "module": "ProcureWatch",
                        "severity": severity,
                        "start_ts": to_iso(datetime.combine(week_end, time(hour=9, tzinfo=IST))),
                        "end_ts": "",
                        "projected_impact_inr": projected_impact,
                        "realized_impact_inr": "",
                        "formula_name": "invoice_leakage" if anomaly_type == "contract_rate_drift" else "validated_unit_gap",
                        "formula_inputs_json": json.dumps(
                            {
                                "service_unit_count": service_units,
                                "validated_unit_count": validated_units,
                                "billed_rate_inr": billed_rate,
                                "contracted_rate_inr": contract["contracted_rate_inr"],
                            }
                        ),
                        "root_cause": "Vendor billing drifted from the contracted baseline or exceeded validated operational evidence.",
                        "recommended_action": "open_procurement_review" if anomaly_type == "contract_rate_drift" else "raise_vendor_dispute",
                        "required_team_type": "procurement" if anomaly_type == "contract_rate_drift" else "finance_control",
                        "required_role": "procurement_manager" if anomaly_type == "contract_rate_drift" else "finance_analyst",
                        "expected_approver_role": "finance_controller",
                    }
                )
                counts["ground_truth_anomalies.csv"] += 1
                anomaly_id_counter += 1
            invoice_id += 1

    duplicate_candidates = [row for row in invoice_rows if row["vendor_id"] in {1, 2, 3, 4, 7, 8}]
    for original in rng.sample(duplicate_candidates, k=min(14, len(duplicate_candidates))):
        duplicate = dict(original)
        duplicate["invoice_id"] = invoice_id
        duplicate["invoice_ref"] = f"{original['invoice_ref']}-DUP"
        invoices_writer.writerow(duplicate)
        counts["invoices.csv"] += 1
        anomaly_counter["duplicate_vendor_invoice"] += 1
        anomalies_writer.writerow(
            {
                "anomaly_id": f"A-{anomaly_id_counter}",
                "entity_type": "invoice",
                "entity_id": invoice_id,
                "anomaly_type": "duplicate_vendor_invoice",
                "module": "ProcureWatch",
                "severity": "high",
                "start_ts": to_iso(datetime.combine(datetime.fromisoformat(original["invoice_date"]).date(), time(hour=11, tzinfo=IST))),
                "end_ts": "",
                "projected_impact_inr": original["amount_inr"],
                "realized_impact_inr": "",
                "formula_name": "duplicate_invoice_amount",
                "formula_inputs_json": json.dumps(
                    {
                        "original_invoice_id": original["invoice_id"],
                        "duplicate_invoice_id": invoice_id,
                        "amount_inr": original["amount_inr"],
                    }
                ),
                "root_cause": "A duplicate vendor invoice entered the payable queue for the same store and billing period.",
                "recommended_action": "hold_vendor_payment",
                "required_team_type": "finance_control",
                "required_role": "finance_controller",
                "expected_approver_role": "finance_controller",
            }
        )
        counts["ground_truth_anomalies.csv"] += 1
        anomaly_id_counter += 1
        invoice_id += 1

    for row in APPROVAL_PLAYBOOKS:
        playbooks_writer.writerow(
            {
                "anomaly_type": row[0],
                "risk_level": row[1],
                "recommended_action": row[2],
                "required_team_type": row[3],
                "required_role": row[4],
                "approver_role": row[5],
                "auto_mode_allowed": row[6],
            }
        )
        counts["approval_playbooks.csv"] += 1

    writer.close()

    readme_lines = [
        "# Delivra India Synthetic Dataset",
        "",
        "This bundle contains Blinkit-style quick-commerce synthetic data generated for SLA.ck demos.",
        "",
        f"- Seed: `{seed}`",
        f"- Date range: `{start_date.isoformat()}` to `{(today - timedelta(days=1)).isoformat()}`",
        f"- Cities: `{len(cities)}`",
        f"- Dark stores: `{len(stores)}`",
        f"- Employees: `{counts['employees.csv']}`",
        f"- Drivers: `{counts['drivers.csv']}`",
        "",
        "## Row Counts",
        "",
    ]
    for name in [
        "organizations.csv",
        "cities.csv",
        "dark_stores.csv",
        "teams.csv",
        "employees.csv",
        "drivers.csv",
        "vendors.csv",
        "contracts.csv",
        "orders.csv",
        "order_items.csv",
        "delivery_events.csv",
        "inventory_snapshots.csv",
        "work_items.csv",
        "invoices.csv",
        "ground_truth_anomalies.csv",
        "approval_playbooks.csv",
    ]:
        readme_lines.append(f"- `{name}`: {counts[name]}")

    readme_lines.extend(["", "## Anomaly Counts", ""])
    for anomaly_name, count in sorted(anomaly_counter.items()):
        readme_lines.append(f"- `{anomaly_name}`: {count}")

    readme_lines.extend(
        [
            "",
            "## Notes",
            "",
            "- Currency is INR.",
            "- Timestamps are in Asia/Kolkata.",
            "- Ground truth anomalies include routing metadata, formula inputs, and expected approver roles.",
            "- This bundle is optimized for realistic demo behavior, not production privacy guarantees.",
        ]
    )
    (output_dir / "README.md").write_text("\n".join(readme_lines) + "\n", encoding="utf-8")
    counts["README.md"] = 1
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate Delivra India synthetic quick-commerce data.")
    parser.add_argument(
        "--output-dir",
        default=str(Path(__file__).resolve().parents[1] / "data" / "synthetic" / "delivra_india"),
        help="Directory where the CSV bundle will be written.",
    )
    parser.add_argument("--days", type=int, default=14, help="Number of historical days to generate.")
    parser.add_argument("--seed", type=int, default=20260329, help="Random seed for deterministic generation.")
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    ensure_dir(output_dir)
    counts = generate_bundle(output_dir=output_dir, days=args.days, seed=args.seed)
    print(f"Generated Delivra dataset at {output_dir}")
    for name, count in sorted(counts.items()):
        print(f"{name}: {count}")


if __name__ == "__main__":
    main()
