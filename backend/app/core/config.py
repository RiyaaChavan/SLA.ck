from pathlib import Path

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
    synthetic_data_dir: Path = DATA_DIR / "synthetic"
    agent_memory_dir: Path = DATA_DIR / "agent_memory"
    gemini_api_key: str | None = None
    google_api_key: str | None = None
    gemini_model: str = "gemini-2.5-flash"
    cerebras_api_key: str | None = None
    cerebras_base_url: str = "https://api.cerebras.ai/v1"
    cerebras_model: str = "gpt-oss-120b"

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


settings = Settings()
