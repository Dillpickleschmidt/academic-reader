# Runpod PyTorch base image - PyTorch 2.8, Python 3.11
FROM runpod/pytorch:2.8.0-py3.11-cuda12.8.1-cudnn-devel-ubuntu22.04

WORKDIR /app

# Install system dependencies for audio processing (sox required for Qwen3-TTS)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 \
    ffmpeg \
    sox \
    && rm -rf /var/lib/apt/lists/*

# Install qwen-tts
RUN pip install --no-cache-dir qwen-tts

# Install remaining deps + web framework
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download and cache Qwen3-TTS model during build
# IMPORTANT: This must be BEFORE copying app code so app changes don't invalidate model cache
RUN python -c "\
from qwen_tts import Qwen3TTSModel; \
import torch; \
device = 'cuda' if torch.cuda.is_available() else 'cpu'; \
print(f'Loading model on {device}...'); \
Qwen3TTSModel.from_pretrained('Qwen/Qwen3-TTS-12Hz-1.7B-Base', device_map=device); \
print('Model cached successfully')"

# Pre-download MMS alignment model for word-level timestamps
RUN python -c "\
from torchaudio.pipelines import MMS_FA; \
print('Downloading MMS alignment model...'); \
MMS_FA.get_model(); \
print('MMS model cached successfully')"

COPY app/ ./app/
COPY voices/ ./voices/

EXPOSE 8002

# Default to Runpod serverless handler
# Local dev: docker-compose overrides with "uvicorn app.main:app ..."
CMD ["python", "-u", "-m", "app.handler"]
