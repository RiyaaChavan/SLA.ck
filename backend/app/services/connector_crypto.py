from cryptography.fernet import Fernet

from app.core.config import settings


_fernet = Fernet(settings.connector_fernet_key.encode("utf-8"))


def encrypt_connector_uri(uri: str) -> str:
    return _fernet.encrypt(uri.encode("utf-8")).decode("utf-8")


def decrypt_connector_uri(encrypted_uri: str) -> str:
    return _fernet.decrypt(encrypted_uri.encode("utf-8")).decode("utf-8")
