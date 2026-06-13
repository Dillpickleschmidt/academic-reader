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
        import os
        import sys
        import tempfile
        from pathlib import Path
        from urllib.parse import urlparse

        import httpx

        sys.path.insert(0, "/root")
        from app.conversion import convert_file
        from app.event_client import ProcessingEventClient
        from app.models import get_or_create_models
        from app.progress import install_tqdm_progress_hook

        event_client = ProcessingEventClient(
            request["appApiUrl"],
            request["sourceDocumentId"],
            request["ingestToken"],
        )
        file_path = None

        try:
            event_client.emit(
                type="conversion.started",
                severity="info",
                message="Marker conversion started on Modal.",
                data={
                    "useLlm": request.get("useLlm", False),
                    "forceOcr": request.get("forceOcr", False),
                    "pageRange": request.get("pageRange"),
                },
            )
            suffix = Path(urlparse(request["fileUrl"]).path).suffix or ".pdf"
            fd, path = tempfile.mkstemp(prefix="marker-modal-", suffix=suffix)
            file_path = Path(path)
            with httpx.Client(follow_redirects=True, timeout=120.0) as client:
                response = client.get(request["fileUrl"])
                response.raise_for_status()
                with os.fdopen(fd, "wb") as output:
                    output.write(response.content)

            with install_tqdm_progress_hook(event_client):
                model_dict = get_or_create_models()
                result = convert_file(
                    file_path,
                    request.get("useLlm", False),
                    request.get("forceOcr", False),
                    request.get("pageRange"),
                    artifact_dict=model_dict,
                )
            models_volume.commit()

            event_client.post_result(result)
            return {"ok": True}
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
            raise
        finally:
            if file_path and file_path.exists():
                file_path.unlink(missing_ok=True)


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
