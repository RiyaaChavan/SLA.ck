# Delivra India Synthetic Dataset

This bundle contains Blinkit-style quick-commerce synthetic data generated for SLA.ck demos.

- Seed: `20260329`
- Date range: `2026-03-15` to `2026-03-28`
- Cities: `6`
- Dark stores: `34`
- Employees: `1059`
- Drivers: `858`

## Row Counts

- `organizations.csv`: 1
- `cities.csv`: 6
- `dark_stores.csv`: 34
- `teams.csv`: 117
- `employees.csv`: 1059
- `drivers.csv`: 858
- `vendors.csv`: 10
- `contracts.csv`: 10
- `orders.csv`: 149811
- `order_items.csv`: 470389
- `delivery_events.csv`: 1198488
- `inventory_snapshots.csv`: 2856
- `work_items.csv`: 1102
- `invoices.csv`: 354
- `ground_truth_anomalies.csv`: 359
- `approval_playbooks.csv`: 8

## Anomaly Counts

- `cold_chain_breach_risk`: 9
- `contract_rate_drift`: 8
- `driver_shortage_peak_window`: 222
- `duplicate_vendor_invoice`: 14
- `saas_license_underuse`: 13
- `store_underuse`: 15
- `validated_units_mismatch`: 20
- `warehouse_pick_backlog`: 58

## Notes

- Currency is INR.
- Timestamps are in Asia/Kolkata.
- Ground truth anomalies include routing metadata, formula inputs, and expected approver roles.
- This bundle is optimized for realistic demo behavior, not production privacy guarantees.
