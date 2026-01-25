# Runpod PyTorch base image with PyTorch 2.9.1 (required by vLLM 0.14.x)
FROM runpod/pytorch:1.0.3-cu1290-torch291-ubuntu2204

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
