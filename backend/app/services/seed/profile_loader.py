import yaml

from app.core.config import settings


def load_profiles() -> list[dict]:
    profiles: list[dict] = []
    for file_path in sorted(settings.seed_profiles_dir.glob("*.yaml")):
        with file_path.open("r", encoding="utf-8") as handle:
            profile = yaml.safe_load(handle)
            profile["file_name"] = file_path.name
            profiles.append(profile)
    return profiles
