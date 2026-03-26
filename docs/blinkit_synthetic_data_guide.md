# Blinkit-Style Synthetic Data Guide

## Goal

Generate realistic synthetic data for a quick-commerce company similar to Blinkit so Business Sentry can demonstrate:

- procurement leakage and vendor billing anomalies
- SLA breach prediction and queue monitoring
- warehouse and fleet overload or underuse
- approval routing to the correct team or manager
- explainable money-at-risk calculations

The data should look operationally real, not random. It should preserve valid foreign keys, plausible timestamps, realistic city/store behavior, and enough ground-truth anomalies to showcase the product.

## Recommended Scale

Use the `medium` tier unless you explicitly need a stress test.

| Tier | Cities | Dark stores / warehouses | Orders / day | Drivers | Employees | Days of history |
| --- | --- | --- | --- | --- | --- | --- |
| Small | 4 | 18-25 | 8k-15k | 350-550 | 450-700 | 21 |
| Medium | 6-8 | 40-60 | 22k-40k | 900-1,400 | 1,100-1,700 | 28-45 |
| Large | 10-14 | 90-140 | 60k-120k | 2,500-4,500 | 3,000-5,500 | 45-60 |

Recommended default:

- `7 cities`
- `48 dark stores`
- `30 days`
- `28k orders/day average`
- `1,150 drivers`
- `1,350 employees`

This is large enough to look real, but still manageable for local generation and demo queries.

## Output Bundle

Generate these files as CSV or Parquet. CSV is fine for the first pass.

1. `organizations.csv`
2. `cities.csv`
3. `dark_stores.csv`
4. `teams.csv`
5. `employees.csv`
6. `drivers.csv`
7. `vendors.csv`
8. `contracts.csv`
9. `orders.csv`
10. `order_items.csv`
11. `delivery_events.csv`
12. `inventory_snapshots.csv`
13. `work_items.csv`
14. `invoices.csv`
15. `ground_truth_anomalies.csv`
16. `approval_playbooks.csv`

If the smaller agent must minimize scope, the minimum viable set is:

- `dark_stores.csv`
- `teams.csv`
- `employees.csv`
- `drivers.csv`
- `vendors.csv`
- `contracts.csv`
- `orders.csv`
- `delivery_events.csv`
- `inventory_snapshots.csv`
- `work_items.csv`
- `invoices.csv`
- `ground_truth_anomalies.csv`

## Entity Schema

### `organizations.csv`

- `org_id`
- `org_name`
- `industry`
- `country`
- `currency_code`
- `timezone`

One row only. Use:

- `org_name = QuickBasket India`
- `industry = Quick Commerce`
- `country = India`
- `currency_code = INR`
- `timezone = Asia/Kolkata`

### `cities.csv`

- `city_id`
- `city_name`
- `tier`
- `state`
- `population_bucket`
- `rain_risk_score`
- `traffic_risk_score`
- `demand_multiplier`

Suggested cities:

- Bengaluru
- Hyderabad
- Mumbai
- Delhi NCR
- Pune
- Chennai
- Kolkata

Use city multipliers so demand and on-time delivery vary by city. Do not make every city uniform.

### `dark_stores.csv`

- `store_id`
- `org_id`
- `city_id`
- `store_name`
- `micro_market`
- `latitude`
- `longitude`
- `opening_hour`
- `closing_hour`
- `daily_order_capacity`
- `pick_capacity_per_hour`
- `inventory_slot_capacity`
- `cold_storage_capacity_units`
- `active_flag`

Rules:

- 5-12 stores per city, but unevenly distributed.
- Mumbai, Bengaluru, Delhi should have the highest order capacity.
- Small stores: `daily_order_capacity` 350-700.
- Medium stores: `daily_order_capacity` 700-1,100.
- Large stores: `daily_order_capacity` 1,100-1,800.
- `pick_capacity_per_hour` should correlate with size.
- 10-15 percent of stores should have tighter capacity and worse congestion.

### `teams.csv`

- `team_id`
- `org_id`
- `city_id`
- `store_id`
- `team_name`
- `team_type`
- `parent_team_id`
- `manager_employee_id`
- `slack_channel`
- `escalation_level`

Use these `team_type` values:

- `dark_store_ops`
- `inventory_control`
- `fleet_ops`
- `customer_escalations`
- `city_ops`
- `procurement`
- `finance_control`
- `regional_command`

Hierarchy pattern:

- regional command
- city ops
- dark store ops / fleet ops / inventory control
- customer escalations, finance control, procurement as cross-functional teams

### `employees.csv`

- `employee_id`
- `org_id`
- `team_id`
- `store_id`
- `city_id`
- `employee_name`
- `role`
- `manager_employee_id`
- `employment_type`
- `shift_type`
- `tenure_months`
- `base_monthly_salary_inr`
- `productivity_score`
- `attendance_risk_score`
- `active_flag`

Typical roles:

- regional_ops_head
- city_ops_manager
- dark_store_manager
- shift_lead
- picker
- packer
- inventory_associate
- fleet_manager
- finance_controller
- procurement_manager
- escalation_specialist

Rules:

- Most employees should belong to stores or city teams.
- `productivity_score` should be 0.65-1.25 with a bell curve around 0.95.
- `attendance_risk_score` should be 0.02-0.25 for most staff, with a small tail up to 0.55.
- Salaries should match role realism. Example:
  - picker/packer: 15k-24k INR
  - shift lead: 24k-38k INR
  - dark store manager: 40k-75k INR
  - city ops manager: 80k-160k INR
  - finance/procurement manager: 70k-150k INR

### `drivers.csv`

- `driver_id`
- `org_id`
- `city_id`
- `primary_store_id`
- `fleet_team_id`
- `driver_name`
- `vehicle_type`
- `employment_mode`
- `tenure_months`
- `rating`
- `acceptance_rate`
- `on_time_rate`
- `daily_order_capacity`
- `attendance_risk_score`
- `active_flag`

Rules:

- 75-85 percent should be gig/partner drivers.
- 15-25 percent can be fixed-contract riders.
- `daily_order_capacity` should usually be 14-32 deliveries/day.
- `acceptance_rate` should usually be 0.82-0.97.
- `on_time_rate` should usually be 0.78-0.96.
- A few cities should have lower rider reliability and higher churn.

### `vendors.csv`

- `vendor_id`
- `org_id`
- `vendor_name`
- `vendor_category`
- `city_scope`
- `risk_rating`
- `billing_cycle`
- `payment_terms_days`

Recommended categories:

- `last_mile_partner`
- `packaging_supplier`
- `cold_chain_supplier`
- `warehouse_consumables`
- `staffing_agency`
- `software_saas`

### `contracts.csv`

- `contract_id`
- `org_id`
- `vendor_id`
- `contract_type`
- `service_unit`
- `contracted_rate_inr`
- `rate_tolerance_pct`
- `start_date`
- `end_date`
- `sla_name`
- `response_deadline_hours`
- `resolution_deadline_hours`
- `penalty_per_breach_inr`
- `auto_action_allowed`

Examples:

- packaging per order
- cold chain per crate
- staffing per shift
- last-mile payout per completed drop
- SaaS fee per active seat

### `orders.csv`

- `order_id`
- `org_id`
- `city_id`
- `store_id`
- `customer_id_hash`
- `order_ts`
- `promised_eta_minutes`
- `actual_delivery_minutes`
- `basket_value_inr`
- `discount_value_inr`
- `delivery_fee_inr`
- `payment_method`
- `order_status`
- `item_count`
- `distance_km`
- `assigned_driver_id`
- `picker_employee_id`
- `packer_employee_id`
- `peak_flag`
- `rain_flag`
- `surge_flag`

Rules:

- `basket_value_inr` should be log-normal, usually 220-850 INR, with a tail up to 1,800.
- `item_count` should mostly be 3-18, with a small tail to 35.
- `promised_eta_minutes` should mostly be 8-20.
- `actual_delivery_minutes` should typically be within ±5 of promise, but peak/rain/shortage windows should create late deliveries.
- `distance_km` should mostly be 0.5-6.5.

### `order_items.csv`

- `order_item_id`
- `order_id`
- `sku_id`
- `sku_name`
- `category`
- `quantity`
- `mrp_inr`
- `selling_price_inr`
- `procurement_cost_inr`
- `substituted_flag`
- `fulfilled_flag`

Rules:

- Grocery categories should dominate: fruits, vegetables, dairy, snacks, beverages, personal care, household essentials.
- 2-6 percent of order lines should be substituted or unfulfilled during tight inventory windows.

### `delivery_events.csv`

- `event_id`
- `order_id`
- `driver_id`
- `store_id`
- `event_type`
- `event_ts`
- `event_sequence`
- `gps_distance_km`
- `delay_reason`

Use a valid event chain:

- `order_placed`
- `picker_assigned`
- `picked`
- `packed`
- `driver_assigned`
- `dispatched`
- `customer_handoff`
- `delivered`

Only some delayed orders should include `delay_reason`:

- `rain`
- `traffic`
- `rider_shortage`
- `store_backlog`
- `inventory_substitution`

### `inventory_snapshots.csv`

- `snapshot_id`
- `snapshot_ts`
- `store_id`
- `city_id`
- `resource_type`
- `resource_name`
- `active_units`
- `provisioned_units`
- `utilization_pct`
- `monthly_cost_inr`
- `shift_staff_present`
- `shift_staff_planned`

Recommended `resource_type` values:

- `picker_capacity`
- `packer_capacity`
- `driver_capacity`
- `cold_storage`
- `dispatch_bays`
- `saas_licenses`

This table is the easiest way to feed the current repo’s resource-style monitoring.

### `work_items.csv`

- `work_item_id`
- `org_id`
- `city_id`
- `store_id`
- `team_id`
- `item_type`
- `priority`
- `opened_at`
- `expected_by`
- `resolved_at`
- `status`
- `estimated_value_inr`
- `backlog_hours`
- `linked_order_id`
- `linked_vendor_id`

Use these `item_type` values:

- `delivery_exception`
- `inventory_replenishment`
- `customer_escalation`
- `vendor_dispute`
- `store_incident`
- `cold_chain_issue`

This table is the operational queue that supports SLA Sentinel.

### `invoices.csv`

- `invoice_id`
- `org_id`
- `vendor_id`
- `contract_id`
- `store_id`
- `city_id`
- `invoice_ref`
- `invoice_date`
- `billing_period_start`
- `billing_period_end`
- `service_unit_count`
- `validated_unit_count`
- `billed_rate_inr`
- `contracted_rate_inr`
- `amount_inr`
- `status`

Use invoice patterns that map directly to product anomalies:

- duplicate invoices
- billed rate higher than contract
- units billed greater than validated units
- unusual vendor spikes by city/store

### `ground_truth_anomalies.csv`

- `anomaly_id`
- `entity_type`
- `entity_id`
- `anomaly_type`
- `module`
- `severity`
- `start_ts`
- `end_ts`
- `projected_impact_inr`
- `realized_impact_inr`
- `formula_name`
- `formula_inputs_json`
- `root_cause`
- `recommended_action`
- `required_team_type`
- `required_role`
- `expected_approver_role`

This file is critical. It lets the app show explainable anomalies and lets you validate detectors.

### `approval_playbooks.csv`

- `anomaly_type`
- `risk_level`
- `recommended_action`
- `required_team_type`
- `required_role`
- `approver_role`
- `auto_mode_allowed`

Examples:

- `sla_breach_risk -> fleet_ops -> fleet_manager -> city_ops_manager`
- `duplicate_vendor_invoice -> finance_control -> finance_controller -> finance_controller`
- `driver_shortage_peak_window -> fleet_ops -> fleet_manager -> city_ops_manager`

## Realism Rules

### Demand Shape

Hourly order demand should not be flat.

- Breakfast: low
- Lunch: medium spike
- Evening: highest spike
- Late night: near zero except a few metros
- Friday to Sunday: 8-18 percent higher demand
- Rain or city events: 10-35 percent localized spikes
- Large stores in metro cities should have much steeper evening peaks

Use:

- negative binomial or Poisson-with-overdispersion for hourly order counts
- log-normal for basket value
- triangular or normal for pick and pack times

### Workforce and Fleet Constraints

Store operations must be capacity-linked.

- More orders should increase pick time, pack time, and rider queue time.
- If `active drivers < required drivers`, actual delivery minutes should degrade.
- If `shift_staff_present < shift_staff_planned`, pick backlog should rise.
- Stores with better managers and better productivity should absorb peaks more smoothly.

### Geographic Heterogeneity

Do not make all cities behave the same.

- Bengaluru and Mumbai should have higher demand and traffic penalties.
- Delhi NCR can have longer distances and slightly more variance.
- Pune and Chennai can be cleaner baselines.
- Kolkata can have more rain risk and longer delay tails in monsoon scenarios.

### Vendor Heterogeneity

Vendors should differ in quality and risk.

- last-mile partners can have higher invoice and SLA variability
- packaging suppliers can show rate drift and duplicate billing
- staffing agencies can create utilization and overtime anomalies
- SaaS vendors can show seat underuse

## Noise Rules

Keep data mostly usable. The goal is realism, not broken pipelines.

- 94-97 percent of rows should be clean.
- 2-4 percent can have soft noise such as null non-critical fields, slightly delayed timestamps, or optional reason codes missing.
- 0.3-0.8 percent can have duplicate event rows or duplicate invoice references.
- 0.5-1.5 percent can have timestamp skew of 2-15 minutes between operational steps.
- 1-3 percent of snapshots can arrive late by a few hours.
- Less than 0.2 percent should have referential issues, and only if your ingestion stack can tolerate them. Otherwise keep foreign keys perfect.

Recommended soft noise:

- missing `delay_reason`
- missing `packer_employee_id` on a few orders
- stale inventory snapshot timestamps
- duplicate delivery events with same `order_id` and `event_type`
- minor rounding differences between invoice amount and unit x rate

Avoid:

- impossible negative durations
- delivered before dispatched
- billed rate lower than zero
- orphaned store or employee ids

## Anomaly Injection Rules

Inject enough anomalies to demonstrate capabilities, but keep them rare enough to feel believable.

Target anomaly prevalence across the full dataset:

- `0.8-1.8 percent` of invoices with clear procurement anomalies
- `2-5 percent` of live work items with meaningful SLA breach risk
- `3-7 percent` of store-hour snapshots with overload or underuse issues
- `1-3 percent` of driver-store-day combinations with shortage conditions

Recommended anomaly types:

1. `duplicate_vendor_invoice`
   - Duplicate same `vendor_id`, `amount_inr`, `billing_period`, and `store_id`
   - One original plus one accidental duplicate
   - Projected impact = duplicate invoice amount

2. `contract_rate_drift`
   - `billed_rate_inr` is 8-22 percent above `contracted_rate_inr`
   - More likely for packaging and staffing vendors
   - Projected impact = `(billed_rate - contracted_rate) x service_unit_count`

3. `validated_units_mismatch`
   - `service_unit_count` exceeds `validated_unit_count` by 3-18 percent
   - Common for last-mile or staffing vendors
   - Projected impact = `(service_unit_count - validated_unit_count) x billed_rate_inr`

4. `driver_shortage_peak_window`
   - Peak hours where active drivers fall 15-35 percent short of demand
   - Causes late delivery clusters in specific cities or stores
   - Projected impact from missed orders, coupon compensation, and churn proxy

5. `warehouse_pick_backlog`
   - Picker/packer capacity drops because of absenteeism or sudden demand spikes
   - `backlog_hours` and pick time rise
   - Leads to SLA risk in `work_items`

6. `cold_chain_breach_risk`
   - Cold storage overload or delayed handling on perishables
   - Small number of high-severity incidents

7. `saas_license_underuse`
   - Seat utilization below 35 percent for an operations tool
   - Monthly cost fully visible, easy ROI case

8. `store_underuse`
   - Some dark stores have sustained low order volume but full staffing
   - Useful for resource optimization and consolidation recommendations

## Formula Rules

Every anomaly must have a traceable formula and structured inputs.

- Duplicate spend: `duplicate invoice amount`
- Rate drift: `(billed_rate - contracted_rate) x units`
- Validation mismatch: `(billed_units - validated_units) x billed_rate`
- SLA penalty: `likely breaches x penalty per breach`
- Driver shortage loss: `late orders x compensation_per_order + predicted cancellations x avg_margin_loss`
- Capacity waste: `monthly_cost x (1 - utilization_pct / 100)`

Store `formula_name` and `formula_inputs_json` in `ground_truth_anomalies.csv`.

## Team Routing Rules

The dataset must let Business Sentry know where to route action requests.

Use these routing defaults:

- invoice anomalies -> `finance_control` or `procurement`
- warehouse overload -> `dark_store_ops`
- driver shortage -> `fleet_ops`
- customer SLA risk -> `customer_escalations` plus `city_ops`
- cold chain issues -> `inventory_control` plus `city_ops`

For each anomaly, include:

- `required_team_type`
- `required_role`
- `expected_approver_role`

Examples:

- `duplicate_vendor_invoice -> finance_control -> finance_controller -> finance_controller`
- `warehouse_pick_backlog -> dark_store_ops -> dark_store_manager -> city_ops_manager`
- `driver_shortage_peak_window -> fleet_ops -> fleet_manager -> city_ops_manager`

## Generation Order

Generate in this order so foreign keys stay valid:

1. organization
2. cities
3. dark stores
4. teams
5. employees
6. drivers
7. vendors
8. contracts
9. inventory snapshots
10. orders
11. order items
12. delivery events
13. work items
14. invoices
15. ground-truth anomalies
16. approval playbooks

## Mapping to the Current Repo

If you want a smaller agent to generate data that can later be adapted into the current repo quickly:

- `work_items.csv` maps cleanly to the current `Workflow` concept
- `invoices.csv` maps to the current `Invoice` concept
- `contracts.csv` maps to `Contract`
- `inventory_snapshots.csv` maps to `ResourceSnapshot`
- `ground_truth_anomalies.csv` maps to future `Case` and explanation data
- `approval_playbooks.csv` maps to approval policies and action templates

For the existing YAML seed profile format in `data/seed_profiles`, a Blinkit-like profile should use:

- departments: dark store ops, fleet ops, inventory control, procurement, finance control, customer escalations
- vendors: last-mile, packaging, staffing, cold chain, SaaS
- workflow types: delivery_exception, inventory_replenishment, vendor_dispute, customer_escalation, store_incident
- resources: picker_capacity, driver_capacity, dispatch_bays, cold_storage, saas_licenses

## Validation Checklist

Before accepting the dataset, verify:

- all foreign keys resolve
- every order belongs to a valid store, city, driver, and operational team
- every invoice belongs to a valid vendor and contract
- peak demand windows actually produce worse delivery performance
- high-capacity stores outperform low-capacity stores on similar demand
- anomalies are sparse but visible
- `ground_truth_anomalies.csv` covers every major demo capability
- financial values are plausible in INR and not wildly uniform
- timestamps fall in IST-friendly daily rhythms

## Small-Agent Task Prompt

Give the smaller agent this task:

1. Generate a `medium`-tier quick-commerce synthetic dataset for `QuickBasket India` using the schema and realism rules in this file.
2. Produce the sixteen files listed above as CSV in one folder.
3. Keep all foreign keys valid and all timestamps in `Asia/Kolkata`.
4. Inject the anomaly types listed above at the target prevalence.
5. Populate `ground_truth_anomalies.csv` with formula inputs, routing metadata, and expected approver roles.
6. Write a short `README.md` in the output folder explaining row counts per file, anomaly counts by type, and the date range used.

If you want the smaller agent to stay scoped, tell it not to integrate the dataset into the app yet. Its job is only to generate the realistic synthetic bundle and the anomaly ground truth.
