import json
import threading
import time
from datetime import datetime, timezone

_model_cache: dict | None = None
_model_lock = threading.Lock()


def log(message: str):
    print(
        json.dumps(
            {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "service": "academic-reader-worker",
                "worker": "marker",
                "eventName": "worker_lifecycle",
                "message": message,
            }
        ),
        flush=True,
    )


def get_or_create_models() -> dict:
    global _model_cache
    with _model_lock:
        if _model_cache is None:
            log("Loading Marker models")
            start = time.perf_counter()
            from marker.models import create_model_dict

            _model_cache = create_model_dict()
            log(f"Marker models loaded in {time.perf_counter() - start:.1f}s")
        else:
            log("Using cached Marker models")
        return _model_cache
