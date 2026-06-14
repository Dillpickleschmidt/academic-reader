from __future__ import annotations

import os
import tempfile
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx

from .event_client import ProcessingEventClient
from .progress import install_tqdm_progress_hook


@dataclass(frozen=True)
class MarkerProcessingRunRequest:
    file_url: str
    app_api_url: str
    document_id: str
    ingest_token: str
    use_llm: bool = False
    force_ocr: bool = False
    page_range: str | None = None


@dataclass(frozen=True)
class MarkerProcessingRunRuntime:
    temp_dir: Path | None = None
    model_provider: Callable[[], dict[str, Any]] | None = None
    after_success: Callable[[], None] | None = None
    raise_errors: bool = False


def run_marker_processing_run(
    request: MarkerProcessingRunRequest,
    runtime: MarkerProcessingRunRuntime = MarkerProcessingRunRuntime(),
) -> None:
    event_client = ProcessingEventClient(
        request.app_api_url,
        request.document_id,
        request.ingest_token,
    )
    run_id = str(uuid.uuid4())
    file_path: Path | None = None

    try:
        event_client.emit(
            type="conversion.started",
            severity="info",
            message="Marker conversion started.",
            data={
                "useLlm": request.use_llm,
                "forceOcr": request.force_ocr,
                "pageRange": request.page_range,
            },
        )
        file_path = _download_source_document(
            run_id,
            request.file_url,
            runtime.temp_dir,
        )

        with install_tqdm_progress_hook(event_client):
            from .conversion import convert_file

            result = convert_file(
                file_path,
                request.use_llm,
                request.force_ocr,
                request.page_range,
                artifact_dict=(
                    runtime.model_provider() if runtime.model_provider else None
                ),
            )

        if runtime.after_success:
            runtime.after_success()

        event_client.post_result(result)
    except Exception as error:
        message = str(error)
        try:
            event_client.emit(
                type="conversion.failed",
                severity="error",
                message=message,
            )
        except Exception:
            pass
        try:
            event_client.post_error(message)
        except Exception:
            pass
        if runtime.raise_errors:
            raise
    finally:
        if file_path and file_path.exists():
            try:
                file_path.unlink()
            except Exception:
                pass


def _download_source_document(
    run_id: str,
    file_url: str,
    temp_dir: Path | None,
) -> Path:
    suffix = Path(urlparse(file_url).path).suffix or ".pdf"
    fd, path = tempfile.mkstemp(
        prefix=f"marker-{run_id}-",
        suffix=suffix,
        dir=temp_dir,
    )
    file_path = Path(path)

    with httpx.Client(follow_redirects=True, timeout=120.0) as client:
        response = client.get(file_url)
        response.raise_for_status()
        with os.fdopen(fd, "wb") as output:
            output.write(response.content)

    return file_path
