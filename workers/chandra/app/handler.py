"""Runpod Serverless handler for CHANDRA."""
import json
import tempfile
from pathlib import Path

import httpx
import runpod

from .conversion import convert_file
from .models import get_or_create_manager
from .utils import get_suffix

# Initialize manager on startup (vLLM should already be running from entrypoint)
print("[chandra] Initializing InferenceManager...", flush=True)
get_or_create_manager()
print("[chandra] Handler ready", flush=True)


def upload_result_to_s3(result: dict, upload_url: str) -> bool:
    """Upload result JSON to S3 via presigned URL."""
    try:
        response = httpx.put(
            upload_url,
            content=json.dumps(result),
            headers={"Content-Type": "application/json"},
            timeout=120.0,
        )
        response.raise_for_status()
        return True
    except Exception as e:
        print(f"[chandra] Failed to upload result to S3: {e}", flush=True)
        return False


def handler(job: dict) -> dict:
    """
    Runpod serverless handler.

    Expected input:
    {
        "file_url": "https://...",
        "result_upload_url": "https://...",  # presigned URL for S3 upload
        "mime_type": "application/pdf",  # optional but recommended
        "page_range": "1-5"  # optional
    }
    """
    job_input = job["input"]
    file_url = job_input.get("file_url")
    result_upload_url = job_input.get("result_upload_url")

    if not file_url:
        return {"error": "Missing required field: file_url"}
    if not result_upload_url:
        return {"error": "Missing required field: result_upload_url"}

    page_range = job_input.get("page_range")
    mime_type = job_input.get("mime_type")
    suffix = get_suffix(mime_type, file_url)

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
        result = convert_file(temp_path, page_range)

        # Upload result to S3
        if upload_result_to_s3(result, result_upload_url):
            return {"s3_result": True}
        else:
            return {"error": "Failed to upload result to S3"}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": f"Conversion failed: {e}"}
    finally:
        temp_path.unlink(missing_ok=True)


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
