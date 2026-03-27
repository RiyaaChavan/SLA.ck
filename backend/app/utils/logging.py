import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path

from app.core.config import ROOT_DIR


LOG_FILE_PATH = ROOT_DIR / "logs" / "suchana.log"
LOG_FORMAT = "%(asctime)s %(levelname)s %(name)s %(message)s"


def configure_logging() -> None:
    root_logger = logging.getLogger()
    if getattr(root_logger, "_suchana_logging_configured", False):
        return

    LOG_FILE_PATH.parent.mkdir(parents=True, exist_ok=True)

    root_logger.setLevel(logging.INFO)
    formatter = logging.Formatter(LOG_FORMAT)

    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(formatter)

    file_handler = RotatingFileHandler(
        LOG_FILE_PATH,
        maxBytes=5_000_000,
        backupCount=3,
        encoding="utf-8",
    )
    file_handler.setFormatter(formatter)

    root_logger.handlers.clear()
    root_logger.addHandler(stream_handler)
    root_logger.addHandler(file_handler)
    root_logger._suchana_logging_configured = True  # type: ignore[attr-defined]


def get_logger(name: str) -> logging.Logger:
    configure_logging()
    return logging.getLogger(name)
