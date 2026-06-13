from pathlib import Path
import modal

_here = Path(__file__).parent

MODEL_CACHE_PATH = "/root/.cache/datalab/"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("build-essential")
    .pip_install("marker-pdf[full]", "httpx", "fastapi[standard]", "python-dotenv")
    .add_local_file(_here / "app/__init__.py", "/root/app/__init__.py")
    .add_local_file(_here / "app/config.py", "/root/app/config.py")
    .add_local_file(_here / "app/conversion.py", "/root/app/conversion.py")
    .add_local_file(_here / "app/event_client.py", "/root/app/event_client.py")
    .add_local_file(_here / "app/html_processing.py", "/root/app/html_processing.py")
    .add_local_file(_here / "app/models.py", "/root/app/models.py")
    .add_local_file(_here / "app/processing_run.py", "/root/app/processing_run.py")
    .add_local_file(_here / "app/progress.py", "/root/app/progress.py")
)

app = modal.App("marker", image=image)
models_volume = modal.Volume.from_name("marker-models", create_if_missing=True)


@app.cls(
    gpu="L40S",
    retries=1,
    timeout=1800,
    volumes={MODEL_CACHE_PATH: models_volume},
    secrets=[modal.Secret.from_name("google-api-key")],
)
class Marker:
    @modal.method()
    def convert(self, request: dict):
        import sys

        sys.path.insert(0, "/root")
        from app.models import get_or_create_models
        from app.processing_run import (
            MarkerProcessingRunRequest,
            MarkerProcessingRunRuntime,
            run_marker_processing_run,
        )

        run_marker_processing_run(
            MarkerProcessingRunRequest(
                file_url=request["fileUrl"],
                app_api_url=request["appApiUrl"],
                source_document_id=request["sourceDocumentId"],
                ingest_token=request["ingestToken"],
                use_llm=request.get("useLlm", False),
                force_ocr=request.get("forceOcr", False),
                page_range=request.get("pageRange"),
            ),
            MarkerProcessingRunRuntime(
                model_provider=get_or_create_models,
                after_success=models_volume.commit,
                raise_errors=True,
            ),
        )
        return {"ok": True}


@app.function()
@modal.asgi_app()
def api():
    from fastapi import FastAPI
    from pydantic import BaseModel

    web = FastAPI()
    worker = Marker()

    class RunRequest(BaseModel):
        fileUrl: str
        appApiUrl: str
        sourceDocumentId: str
        ingestToken: str
        useLlm: bool = False
        forceOcr: bool = False
        pageRange: str | None = None

    @web.post("/run")
    async def run(req: RunRequest):
        call = await worker.convert.spawn.aio(req.model_dump())
        return {"id": call.object_id, "status": "accepted"}

    return web
