# Runpod PyTorch base image - PyTorch 2.8 pre-installed
# CUDA 12.8 requires driver 570+ (newer drivers)
FROM runpod/pytorch:2.8.0-py3.11-cuda12.8.1-cudnn-devel-ubuntu22.04

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.lock .

# Install pinned dependencies (PyTorch already in base image - pip will skip it)
RUN pip install --no-cache-dir -r requirements.lock

COPY app/ ./app/

# Download and cache marker models during build
RUN python -c "from marker.models import create_model_dict; create_model_dict()"

EXPOSE 8000

# No CMD - specified at runtime:
# Local: docker-compose sets "uvicorn app.main:app ..."
# Runpod: "python -m app.handler"
