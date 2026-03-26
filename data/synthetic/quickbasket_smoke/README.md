# QuickBasket India Synthetic Dataset

This bundle contains Blinkit-style quick-commerce synthetic data generated for Business Sentry demos.

- Seed: `20260329`
- Date range: `2026-03-27` to `2026-03-28`
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
- `orders.csv`: 23142
- `order_items.csv`: 72405
- `delivery_events.csv`: 185136
- `inventory_snapshots.csv`: 408
- `work_items.csv`: 457
- `invoices.csv`: 184
- `ground_truth_anomalies.csv`: 263
- `approval_playbooks.csv`: 8

## Anomaly Counts

- `cold_chain_breach_risk`: 1
- `contract_rate_drift`: 8
- `driver_shortage_peak_window`: 229
- `duplicate_vendor_invoice`: 14
- `validated_units_mismatch`: 5
- `warehouse_pick_backlog`: 6

## Notes

- Currency is INR.
- Timestamps are in Asia/Kolkata.
- Ground truth anomalies include routing metadata, formula inputs, and expected approver roles.
- This bundle is optimized for realistic demo behavior, not production privacy guarantees.
