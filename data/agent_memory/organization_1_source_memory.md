# Source Memory

Source URI: `sqlite://localhost//private/var/folders/fm/5dtm4hln7tn_ffyl1_9k6xm80000gn/T/pytest-of-swar/pytest-16/test_import_synthetic_bundle_e0/mini_source.db#main`

## Summary
This source looks like an operational commerce / supply chain warehouse.

Highest-signal tables: approval_playbooks.csv (1 rows), cities.csv (1 rows), contracts.csv (1 rows), dark_stores.csv (1 rows), delivery_events.csv (1 rows), drivers.csv (1 rows).

Use invoices and contracts for commercial leakage, work_items for SLA risk, inventory_snapshots for capacity optimization, and orders plus delivery_events for service degradation.

Additional schema notes:
Orders, invoices, and work_items are the key operational tables.

## Dashboard Brief
Primary dashboard sections:
1. Leakage and penalty exposure
2. Open SLA risk queues
3. Resource underuse / overload by site and team
4. Delivery delay and exception clusters
5. Vendor mismatch and duplicate spend investigations

## Saved Anomaly Queries
## Contract rate drift
Category: procurement

Invoices billed above the contracted rate.

```sql
SELECT invoice_ref, vendor_id, billed_rate_inr, contracted_rate_inr, (billed_rate_inr - contracted_rate_inr) * service_unit_count AS leakage_inr FROM "main"."invoices" WHERE CAST(billed_rate_inr AS DOUBLE PRECISION) > CAST(contracted_rate_inr AS DOUBLE PRECISION);
```

## Billed vs validated mismatch
Category: vendor_controls

Find invoices where billed service units exceed validated units.

```sql
SELECT invoice_ref, vendor_id, service_unit_count, validated_unit_count, (service_unit_count - validated_unit_count) * billed_rate_inr AS disputed_inr FROM "main"."invoices" WHERE CAST(service_unit_count AS DOUBLE PRECISION) > CAST(validated_unit_count AS DOUBLE PRECISION);
```

## Open SLA breach risk
Category: sla

Open work items that are unresolved and already in backlog.

```sql
SELECT work_item_id, team_id, item_type, expected_by, backlog_hours FROM "main"."work_items" WHERE status IN ('open', 'pending', 'active') AND COALESCE(NULLIF(backlog_hours, ''), '0')::DOUBLE PRECISION > 0;
```

## Resource underuse and overload
Category: resource_optimization

Capacity rows that are materially underused or overloaded.

```sql
SELECT snapshot_id, store_id, resource_type, resource_name, utilization_pct, monthly_cost_inr FROM "main"."inventory_snapshots" WHERE COALESCE(NULLIF(utilization_pct, ''), '0')::DOUBLE PRECISION < 35 OR COALESCE(NULLIF(utilization_pct, ''), '0')::DOUBLE PRECISION > 110;
```

## Late delivery clusters
Category: delivery

Orders delivered materially later than promised ETA.

```sql
SELECT order_id, city_id, store_id, promised_eta_minutes, actual_delivery_minutes, basket_value_inr FROM "main"."orders" WHERE COALESCE(NULLIF(actual_delivery_minutes, ''), '0')::DOUBLE PRECISION > COALESCE(NULLIF(promised_eta_minutes, ''), '0')::DOUBLE PRECISION + 10;
```
