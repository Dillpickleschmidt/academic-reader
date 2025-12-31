"""Centralized configuration and constants."""

import os
import tempfile
from pathlib import Path

# File storage
UPLOAD_DIR = Path(tempfile.gettempdir()) / "academic-reader-uploads"

# CORS - configurable via environment variable (comma-separated)
# If not set, defaults to localhost for development
_cors_env = os.getenv("CORS_ORIGINS", "")
CORS_ORIGINS = (
    [origin.strip() for origin in _cors_env.split(",") if origin.strip()]
    if _cors_env
    else ["http://localhost:5173", "http://localhost:3000"]
)

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
