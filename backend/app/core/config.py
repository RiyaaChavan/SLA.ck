from pathlib import Path
import base64
import hashlib

from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parents[2]
ROOT_DIR = BASE_DIR.parent
DATA_DIR = ROOT_DIR / "data"
LOCAL_DB_PATH = BASE_DIR / "costpulse_local.db"


class Settings(BaseSettings):
    app_name: str = "Business Sentry"
    app_env: str = "development"
    debug: bool = True
    host: str = "0.0.0.0"
    port: int = 8000
    postgres_user: str = "costpulse"
    postgres_password: str = "costpulse"
    postgres_db: str = "costpulse"
    postgres_host: str = "postgres"
    postgres_port: int = 5432
    database_url_override: str | None = None
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    redis_url: str = "redis://redis:6379/0"
    reports_dir: Path = DATA_DIR / "generated_reports"
    seed_profiles_dir: Path = DATA_DIR / "seed_profiles"
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.5-flash"
    gemini_sql_model: str = "gemini-2.5-flash"
    cerebras_api_key: str | None = None
    cerebras_base_url: str = "https://api.cerebras.ai/v1"
    cerebras_model: str = "gpt-oss-120b"
    connector_encryption_key: str = "business-sentry-dev-key"
    sql_agent_a2a_url: str = "http://sql-agent:8010"
    dashboard_agent_a2a_url: str = "http://dashboard-agent:8011"
    agent_a2a_timeout_seconds: int = 600
    artifact_event_callback_url: str | None = "http://localhost:8000/api/internal/artifacts/events"
    copilot_event_callback_url: str | None = "http://localhost:8000/api/internal/copilot/events"
    scheduler_poll_seconds: int = 30
    source_query_statement_timeout_ms: int = 10_000

    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def _uses_default_postgres_config(self) -> bool:
        postgres_fields = {
            "postgres_user",
            "postgres_password",
            "postgres_db",
            "postgres_host",
            "postgres_port",
        }
        return not self.model_fields_set.intersection(postgres_fields)

    @computed_field
    @property
    def database_url(self) -> str:
        if self.database_url_override:
            return self.database_url_override
        if self.app_env == "development" and self._uses_default_postgres_config:
            return f"sqlite:///{LOCAL_DB_PATH.as_posix()}"
        return (
            f"postgresql+psycopg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @computed_field
    @property
    def connector_fernet_key(self) -> str:
        digest = hashlib.sha256(self.connector_encryption_key.encode("utf-8")).digest()
        return base64.urlsafe_b64encode(digest).decode("utf-8")


settings = Settings()
