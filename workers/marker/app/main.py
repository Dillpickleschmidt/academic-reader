import logging
import os
import tempfile
import uuid
from pathlib import Path
from urllib.parse import urlparse

import httpx
from fastapi import BackgroundTasks, FastAPI
from pydantic import BaseModel

from .config import UPLOAD_DIR
from .event_client import ProcessingEventClient
from .progress import install_tqdm_progress_hook


class PollFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return "/health" not in record.getMessage()


logging.getLogger("uvicorn.access").addFilter(PollFilter())

app = FastAPI()
UPLOAD_DIR.mkdir(exist_ok=True)


class RunRequest(BaseModel):
    fileUrl: str
    appApiUrl: str
    sourceDocumentId: str
    ingestToken: str
    useLlm: bool = False
    forceOcr: bool = False
    pageRange: str | None = None


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/run")
async def run(request: RunRequest, background_tasks: BackgroundTasks):
    run_id = str(uuid.uuid4())
    ProcessingEventClient(
        request.appApiUrl,
        request.sourceDocumentId,
        request.ingestToken,
    ).emit(
        type="conversion.started",
        severity="info",
        message="Marker conversion started.",
        data={
            "runId": run_id,
            "useLlm": request.useLlm,
            "forceOcr": request.forceOcr,
            "pageRange": request.pageRange,
        },
    )
    background_tasks.add_task(run_marker_conversion, run_id, request)
    return {"id": run_id, "status": "accepted"}


def run_marker_conversion(run_id: str, request: RunRequest) -> None:
    event_client = ProcessingEventClient(
        request.appApiUrl,
        request.sourceDocumentId,
        request.ingestToken,
    )
    file_path: Path | None = None

    try:
        file_path = download_source_file(run_id, request.fileUrl)

        with install_tqdm_progress_hook(event_client):
            from .conversion import convert_file

            result = convert_file(
                file_path,
                request.useLlm,
                request.forceOcr,
                request.pageRange,
            )

        event_client.post_result(result)
    except Exception as error:
        message = str(error)
        try:
            event_client.emit(
                type="conversion.failed",
                severity="error",
                message=message,
                data={"runId": run_id},
            )
        except Exception:
            pass
        try:
            event_client.post_error(message)
        except Exception:
            pass
    finally:
        if file_path and file_path.exists():
            try:
                file_path.unlink()
            except Exception:
                pass


def download_source_file(run_id: str, file_url: str) -> Path:
    suffix = Path(urlparse(file_url).path).suffix or ".pdf"
    fd, path = tempfile.mkstemp(prefix=f"marker-{run_id}-", suffix=suffix, dir=UPLOAD_DIR)
    file_path = Path(path)

    with httpx.Client(follow_redirects=True, timeout=120.0) as client:
        response = client.get(file_url)
        response.raise_for_status()
        with os.fdopen(fd, "wb") as output:
            output.write(response.content)

    return file_path
