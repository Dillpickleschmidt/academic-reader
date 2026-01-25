"""Chandra model management with vLLM backend."""
import os
import time
import threading
import httpx
from chandra.model import InferenceManager

_manager_cache: InferenceManager | None = None
_manager_lock = threading.Lock()

VLLM_API_BASE = os.getenv("VLLM_API_BASE", "http://localhost:8000/v1")


def wait_for_vllm_server(timeout: int = 300) -> None:
    """Wait for vLLM server to be ready."""
    start = time.time()
    while time.time() - start < timeout:
        try:
            resp = httpx.get(f"{VLLM_API_BASE}/models", timeout=5.0)
            if resp.status_code == 200:
                print(f"[chandra] vLLM server ready after {time.time() - start:.1f}s")
                return
        except httpx.RequestError:
            pass
        time.sleep(2)
    raise RuntimeError(f"vLLM server not ready after {timeout}s")


def get_or_create_manager() -> InferenceManager:
    """Get cached InferenceManager using vLLM backend."""
    global _manager_cache
    with _manager_lock:
        if _manager_cache is None:
            print("[chandra] Waiting for vLLM server...")
            wait_for_vllm_server()
            print("[chandra] Creating InferenceManager with vLLM backend...")
            _manager_cache = InferenceManager(method="vllm")
            print("[chandra] InferenceManager ready")
        return _manager_cache
