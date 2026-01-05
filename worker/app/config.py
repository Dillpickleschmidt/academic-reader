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
