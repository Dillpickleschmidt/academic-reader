"""Centralized configuration and constants."""

import os
import tempfile
from pathlib import Path

UPLOAD_DIR = Path(tempfile.gettempdir()) / "academic-reader-uploads"

# Marker batch sizes - set MARKER_BATCH_SIZES=h100 for H100 optimization
if os.getenv("MARKER_BATCH_SIZES") == "h100":
    BATCH_SIZE_OVERRIDES = {
        "layout_batch_size": 32,
        "detection_batch_size": 36,
        "table_rec_batch_size": 64,
        "ocr_error_batch_size": 32,
        "recognition_batch_size": 512,
        "equation_batch_size": 32,
    }
else:
    BATCH_SIZE_OVERRIDES = {
        "pdftext_workers": 1,
    }
