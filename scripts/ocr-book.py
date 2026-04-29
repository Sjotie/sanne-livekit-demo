"""Upload het This is not AI PDF naar Mistral, OCR het, en bewaar de markdown.

Vereist MISTRAL_API_KEY in env. Output: data/this-is-not-ai.md.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from email.message import EmailMessage
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parent.parent
PDF = ROOT / "data" / "this-is-not-ai.pdf"
OUT = ROOT / "data" / "this-is-not-ai.md"
OUT_JSON = ROOT / "data" / "this-is-not-ai.ocr.json"

API_KEY = os.environ.get("MISTRAL_API_KEY") or os.environ.get(
    "MISTRAL_API_KEY_FALLBACK"
)
if not API_KEY:
    # Last-resort fallback: lees uit project .env
    env_path = ROOT / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("MISTRAL_API_KEY="):
                API_KEY = line.split("=", 1)[1].strip()
                break

if not API_KEY:
    print("MISTRAL_API_KEY ontbreekt", file=sys.stderr)
    sys.exit(1)


def _multipart(boundary: str, fields: dict[str, str], files: dict[str, tuple[str, bytes, str]]) -> bytes:
    out = []
    for name, value in fields.items():
        out.append(f"--{boundary}\r\n".encode())
        out.append(
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode()
        )
        out.append(value.encode() + b"\r\n")
    for name, (filename, content, mime) in files.items():
        out.append(f"--{boundary}\r\n".encode())
        out.append(
            (
                f'Content-Disposition: form-data; name="{name}"; '
                f'filename="{filename}"\r\n'
            ).encode()
        )
        out.append(f"Content-Type: {mime}\r\n\r\n".encode())
        out.append(content + b"\r\n")
    out.append(f"--{boundary}--\r\n".encode())
    return b"".join(out)


def upload_pdf() -> str:
    print(f"Uploading {PDF.name} ({PDF.stat().st_size / 1024 / 1024:.1f} MB)…")
    boundary = uuid4().hex
    body = _multipart(
        boundary,
        fields={"purpose": "ocr"},
        files={"file": (PDF.name, PDF.read_bytes(), "application/pdf")},
    )
    req = urllib.request.Request(
        "https://api.mistral.ai/v1/files",
        data=body,
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        data = json.loads(resp.read().decode())
    file_id = data["id"]
    print(f"  → file_id = {file_id}")
    return file_id


def get_signed_url(file_id: str) -> str:
    print(f"Signing URL voor {file_id}…")
    req = urllib.request.Request(
        f"https://api.mistral.ai/v1/files/{file_id}/url?expiry=24",
        headers={"Authorization": f"Bearer {API_KEY}"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode())
    return data["url"]


def ocr(signed_url: str) -> dict:
    print("Starten OCR (mistral-ocr-latest)…")
    payload = {
        "model": "mistral-ocr-latest",
        "document": {"type": "document_url", "document_url": signed_url},
        "include_image_base64": False,
    }
    req = urllib.request.Request(
        "https://api.mistral.ai/v1/ocr",
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=600) as resp:
        data = json.loads(resp.read().decode())
    print(f"  → {len(data.get('pages', []))} pagina's, {time.time() - t0:.1f}s")
    return data


def main() -> None:
    if not PDF.exists():
        print(f"PDF niet gevonden: {PDF}", file=sys.stderr)
        sys.exit(1)

    file_id = upload_pdf()
    url = get_signed_url(file_id)
    result = ocr(url)

    OUT_JSON.write_text(json.dumps(result, indent=2, ensure_ascii=False))
    print(f"OCR JSON bewaard: {OUT_JSON}")

    pages = result.get("pages", [])
    md_chunks = []
    for i, page in enumerate(pages, start=1):
        md_chunks.append(f"<!-- pagina {i} -->\n\n{page.get('markdown', '')}")
    OUT.write_text("\n\n".join(md_chunks))
    print(
        f"Markdown bewaard: {OUT}  ({OUT.stat().st_size / 1024:.1f} KB, "
        f"{len(pages)} pagina's)"
    )


if __name__ == "__main__":
    main()
