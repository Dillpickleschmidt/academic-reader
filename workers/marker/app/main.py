import logging

from fastapi import BackgroundTasks, FastAPI
from pydantic import BaseModel

from .config import UPLOAD_DIR
from .processing_run import (
    MarkerProcessingRunRequest,
    MarkerProcessingRunRuntime,
    run_marker_processing_run,
)


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
    background_tasks.add_task(
        run_marker_processing_run,
        MarkerProcessingRunRequest(
            file_url=request.fileUrl,
            app_api_url=request.appApiUrl,
            source_document_id=request.sourceDocumentId,
            ingest_token=request.ingestToken,
            use_llm=request.useLlm,
            force_ocr=request.forceOcr,
            page_range=request.pageRange,
        ),
        MarkerProcessingRunRuntime(temp_dir=UPLOAD_DIR),
    )
    return {"status": "accepted"}
