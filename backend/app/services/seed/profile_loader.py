from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


_SOURCE = Path(__file__).resolve().parents[1] / "seed.local" / "profile_loader.py"
_SPEC = spec_from_file_location("app.services.seed_local.profile_loader", _SOURCE)
if _SPEC is None or _SPEC.loader is None:
    raise RuntimeError(f"Could not load seed profile loader from {_SOURCE}")
_MODULE = module_from_spec(_SPEC)
_SPEC.loader.exec_module(_MODULE)

load_profiles = _MODULE.load_profiles

__all__ = ["load_profiles"]
