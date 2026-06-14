import time
from typing import Any

import httpx


class ProcessingEventClient:
    def __init__(self, app_api_url: str, document_id: str, ingest_token: str):
        self.app_api_url = app_api_url.rstrip("/")
        self.document_id = document_id
        self.ingest_token = ingest_token

    def emit(
        self,
        *,
        type: str,
        severity: str,
        message: str,
        progress: dict[str, Any] | None = None,
        data: dict[str, Any] | None = None,
        page_number: int | None = None,
        block_id: str | None = None,
    ) -> None:
        payload: dict[str, Any] = {
            "documentId": self.document_id,
            "ingestToken": self.ingest_token,
            "type": type,
            "emitter": "marker",
            "severity": severity,
            "message": message,
            "emittedAt": int(time.time() * 1000),
        }
        if progress is not None:
            payload["progress"] = progress
        if data is not None:
            payload["data"] = data
        if page_number is not None:
            payload["pageNumber"] = page_number
        if block_id is not None:
            payload["blockId"] = block_id

        with httpx.Client(timeout=30.0) as client:
            response = client.post(
                f"{self.app_api_url}/api/processing-events/ingest",
                json=payload,
            )
            response.raise_for_status()

    def post_result(self, result: dict[str, Any]) -> None:
        with httpx.Client(timeout=120.0) as client:
            response = client.post(
                f"{self.app_api_url}/api/documents/{self.document_id}/marker-result",
                json={"ingestToken": self.ingest_token, "result": result},
            )
            response.raise_for_status()

    def post_error(self, message: str) -> None:
        with httpx.Client(timeout=30.0) as client:
            response = client.post(
                f"{self.app_api_url}/api/documents/{self.document_id}/marker-result",
                json={"ingestToken": self.ingest_token, "error": message},
            )
            response.raise_for_status()
