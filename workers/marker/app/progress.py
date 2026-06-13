from __future__ import annotations

import importlib
import time
from contextlib import contextmanager
from typing import Any, Iterator

PATCH_MODULES = ("tqdm", "tqdm.std", "tqdm.auto")


@contextmanager
def install_tqdm_progress_hook(event_client, throttle_seconds: float = 0.5) -> Iterator[None]:
    originals: list[tuple[Any, Any]] = []

    def make_progress_tqdm(original_tqdm):
        class ProgressTqdm(original_tqdm):
            def __init__(self, *args, **kwargs):
                self._academic_reader_last_emit = 0.0
                super().__init__(*args, **kwargs)
                emit_progress(self, force=True)

            def update(self, n=1):
                result = super().update(n)
                emit_progress(self)
                return result

            def close(self):
                emit_progress(self, force=True)
                return super().close()

        return ProgressTqdm

    def emit_progress(bar, force: bool = False):
        now = time.monotonic()
        last_emit = getattr(bar, "_academic_reader_last_emit", 0.0)
        total = getattr(bar, "total", None)
        current = getattr(bar, "n", None)
        is_final = total is not None and current is not None and current >= total

        if not force and not is_final and now - last_emit < throttle_seconds:
            return

        setattr(bar, "_academic_reader_last_emit", now)
        label = str(getattr(bar, "desc", "") or "Marker progress")
        progress: dict[str, Any] = {"label": label}
        if isinstance(current, (int, float)):
            progress["current"] = current
        if isinstance(total, (int, float)):
            progress["total"] = total
        if isinstance(current, (int, float)) and isinstance(total, (int, float)) and total > 0:
            progress["percent"] = min(100, max(0, (current / total) * 100))

        try:
            event_client.emit(
                type="conversion.progress",
                severity="info",
                message=label,
                progress=progress,
            )
        except Exception:
            pass

    try:
        for module_name in PATCH_MODULES:
            try:
                module = importlib.import_module(module_name)
            except Exception:
                continue

            original = getattr(module, "tqdm", None)
            if original is None:
                continue

            originals.append((module, original))
            setattr(module, "tqdm", make_progress_tqdm(original))

        yield
    finally:
        for module, original in originals:
            setattr(module, "tqdm", original)
