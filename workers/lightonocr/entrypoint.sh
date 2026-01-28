#!/bin/bash
set -e

# Start vLLM server in background, then run FastAPI
# vLLM is loaded lazily via /load endpoint for faster startup

exec python -u -m uvicorn app.main:app --host 0.0.0.0 --port 8001
