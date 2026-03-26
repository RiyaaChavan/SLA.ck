from pathlib import Path

import yaml

from app.core.config import settings


def load_profiles() -> list[dict]:
    profiles_dir: Path = settings.seed_profiles_dir
    if not profiles_dir.exists():
        return []
    profiles: list[dict] = []
    for path in sorted(profiles_dir.glob("*.yaml")):
        with open(path, encoding="utf-8") as fh:
            profiles.append(yaml.safe_load(fh))
    return profiles
