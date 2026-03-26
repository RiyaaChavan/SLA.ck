from datetime import UTC, datetime

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.models.base import Base
from app.models.domain import DataConnector, DetectorDefinition, DetectorRun, Organization
from app.services import detector_runtime


def test_execute_detector_run_serializes_datetime_sample_rows(tmp_path, monkeypatch):
    database_url = f"sqlite:///{(tmp_path / 'detector-runtime.db').as_posix()}"
    engine = create_engine(database_url, connect_args={"check_same_thread": False}, future=True)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
    Base.metadata.create_all(bind=engine)

    occurred_at = datetime(2026, 3, 30, 14, 51, 16, tzinfo=UTC)

    class FakeCountResult:
        def scalar(self):
            return 1

    class FakeRowsResult:
        def mappings(self):
            return self

        def all(self):
            return [{"invoice_id": "INV-100", "occurred_at": occurred_at}]

    class FakeConnection:
        def execute(self, statement):
            sql = str(statement)
            if "COUNT(*)" in sql:
                return FakeCountResult()
            return FakeRowsResult()

    class FakeEngineContext:
        def __enter__(self):
            return FakeConnection()

        def __exit__(self, exc_type, exc, tb):
            return False

    class FakeEngine:
        def begin(self):
            return FakeEngineContext()

        def dispose(self):
            return None

    monkeypatch.setattr(detector_runtime, "decrypt_connector_uri", lambda _: "postgresql+psycopg://demo")
    monkeypatch.setattr(detector_runtime, "create_engine", lambda *args, **kwargs: FakeEngine())

    db = SessionLocal()
    try:
        organization = Organization(name="Northstar Ops", industry="Retail", geography="India")
        db.add(organization)
        db.flush()

        connector = DataConnector(
            organization_id=organization.id,
            name="Warehouse",
            encrypted_uri="enc",
            status="ready",
            included_schemas=["public"],
        )
        db.add(connector)
        db.flush()

        detector = DetectorDefinition(
            organization_id=organization.id,
            detector_key="inspect_actions_anomalies",
            name="Inspect actions anomalies",
            description="Checks recent issue rows.",
            module="ProcureWatch",
            business_domain="procurement",
            severity="high",
            owner_name="Ops Lead",
            enabled=True,
            logic_type="sql",
            logic_summary="Looks for anomalous actions.",
            query_logic="SELECT invoice_id, occurred_at FROM anomalies",
            expected_output_fields=["invoice_id", "occurred_at"],
            linked_action_template="Open review",
            linked_cost_formula="Impact estimate",
            connector_id=connector.id,
            schedule_minutes=60,
            generation_source="sql_agent",
            validation_status="validated",
        )
        db.add(detector)
        db.commit()

        result = detector_runtime.execute_detector_run(db, detector.id)
        assert result["status"] == "success"
        assert result["row_count"] == 1

        latest_run = db.scalar(
            select(DetectorRun)
            .where(DetectorRun.detector_id == detector.id)
            .order_by(DetectorRun.created_at.desc())
        )
        assert latest_run is not None
        assert latest_run.sample_rows == [{"invoice_id": "INV-100", "occurred_at": occurred_at.isoformat()}]
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()
