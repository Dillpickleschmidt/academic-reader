"""Runpod Serverless handler."""

import tempfile
from pathlib import Path

import httpx
import runpod

from .conversion import run_conversion_sync


def handler(job: dict) -> dict:
    """
    Handler for Runpod Serverless.

    Input:
        file_url: URL to download the file from
        output_format: "html" | "markdown" | "json" (default: "html")
        use_llm: bool (default: False)
        force_ocr: bool (default: False)
        page_range: str | None (default: None)

    Returns:
        content: The converted document
        metadata: Document metadata
    """
    job_input = job["input"]

    file_url = job_input.get("file_url")
    if not file_url:
        return {"error": "Missing required field: file_url"}

    output_format = job_input.get("output_format", "html")
    use_llm = job_input.get("use_llm", False)
    force_ocr = job_input.get("force_ocr", False)
    page_range = job_input.get("page_range")

    # Extract file extension from URL
    url_path = file_url.split("?")[0]  # Remove query params
    suffix = Path(url_path).suffix or ".pdf"

    # Download file to temp location
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as f:
        try:
            with httpx.Client(follow_redirects=True, timeout=60.0) as client:
                response = client.get(file_url)
                response.raise_for_status()
                f.write(response.content)
        except httpx.HTTPError as e:
            return {"error": f"Failed to download file: {e}"}

        temp_path = Path(f.name)

    try:
        result = run_conversion_sync(
            file_path=temp_path,
            output_format=output_format,
            use_llm=use_llm,
            force_ocr=force_ocr,
            page_range=page_range,
        )
        return result
    except Exception as e:
        return {"error": f"Conversion failed: {e}"}
    finally:
        temp_path.unlink(missing_ok=True)


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
