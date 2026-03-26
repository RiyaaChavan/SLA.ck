from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


_SOURCE = Path(__file__).resolve().parents[1] / "seed.local" / "generator.py"
_SPEC = spec_from_file_location("app.services.seed_local.generator", _SOURCE)
if _SPEC is None or _SPEC.loader is None:
    raise RuntimeError(f"Could not load seed generator from {_SOURCE}")
_MODULE = module_from_spec(_SPEC)
_SPEC.loader.exec_module(_MODULE)

seed_database = _MODULE.seed_database
reset_database = _MODULE.reset_database

__all__ = ["seed_database", "reset_database"]
