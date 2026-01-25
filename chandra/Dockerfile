# Runpod PyTorch base image - matches Marker pattern
FROM runpod/pytorch:2.8.0-py3.11-cuda12.8.1-cudnn-devel-ubuntu22.04

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Install dependencies (--ignore-installed needed because base image has
# distutils-installed packages like blinker that conflict with chandra-ocr deps)
RUN pip install --no-cache-dir --ignore-installed -r requirements.txt

COPY app/ ./app/
COPY entrypoint.sh .
RUN chmod +x entrypoint.sh

# Download model during build (for vLLM server)
RUN python -c "from huggingface_hub import snapshot_download; snapshot_download('datalab-to/chandra')"

# vLLM server port
EXPOSE 8000

# Use entrypoint script to manage vLLM server + handler
CMD ["./entrypoint.sh"]
