from io import BytesIO
from zipfile import ZipFile
import xml.etree.ElementTree as ET


def _decode_text(data: bytes) -> str:
    for encoding in ("utf-8", "utf-16", "latin-1"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="ignore")


def extract_text_from_txt(data: bytes) -> str:
    return _decode_text(data).strip()


def extract_text_from_pdf(data: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise RuntimeError("pypdf is required for PDF extraction") from exc

    reader = PdfReader(BytesIO(data))
    pages = [page.extract_text() or "" for page in reader.pages]
    return "\n".join(page.strip() for page in pages if page.strip()).strip()


def extract_text_from_docx(data: bytes) -> str:
    document = ZipFile(BytesIO(data))
    xml_bytes = document.read("word/document.xml")
    root = ET.fromstring(xml_bytes)
    namespaces = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    paragraphs: list[str] = []
    for paragraph in root.findall(".//w:p", namespaces):
        texts = [node.text or "" for node in paragraph.findall(".//w:t", namespaces)]
        combined = "".join(texts).strip()
        if combined:
            paragraphs.append(combined)
    return "\n".join(paragraphs).strip()


def extract_text_from_image(_: bytes) -> str:
    raise RuntimeError("OCR extraction is not configured yet for image uploads")


def extract_text_from_bytes(document_type: str, data: bytes) -> str:
    resolved_type = document_type.lower()
    if resolved_type in {"txt", "text", "md"}:
        return extract_text_from_txt(data)
    if resolved_type == "pdf":
        return extract_text_from_pdf(data)
    if resolved_type == "docx":
        return extract_text_from_docx(data)
    if resolved_type in {"png", "jpg", "jpeg", "scan"}:
        return extract_text_from_image(data)
    return extract_text_from_txt(data)
