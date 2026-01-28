"""Centralized configuration and constants."""

import os
import tempfile
from pathlib import Path

# File storage
UPLOAD_DIR = Path(tempfile.gettempdir()) / "academic-reader-uploads"

# CORS - use SITE_URL as the allowed origin
# If not set, defaults to localhost for development
_site_url = os.getenv("SITE_URL", "")
CORS_ORIGINS = [_site_url] if _site_url else ["http://localhost:5173"]

# Marker batch sizes - set MARKER_BATCH_SIZES=h100 for H100 optimization
# Local mode: disable pdftext multiprocessing (daemon processes can't have children)
# H100 batch sizes match official surya defaults (designed for ~16-20GB VRAM per model)
if os.getenv("MARKER_BATCH_SIZES") == "h100":
    BATCH_SIZE_OVERRIDES = {
        "layout_batch_size": 32,  # surya default: 32 (220MB/item, ~7GB)
        "detection_batch_size": 36,  # surya default: 36 (440MB/item, ~16GB)
        "table_rec_batch_size": 64,  # surya default: 64 (150MB/item, ~10GB)
        "ocr_error_batch_size": 32,
        "recognition_batch_size": 512,  # surya default: 512 (40MB/item, ~20GB)
        "equation_batch_size": 32,
    }
else:
    BATCH_SIZE_OVERRIDES = {
        "pdftext_workers": 1,
    }

# Supported file types
SUPPORTED_EXTENSIONS = {
    ".pdf",
    ".docx",
    ".doc",
    ".odt",
    ".xlsx",
    ".xls",
    ".ods",
    ".pptx",
    ".ppt",
    ".odp",
    ".html",
    ".epub",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".gif",
    ".tiff",
}
