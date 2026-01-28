FROM vllm/vllm-openai:v0.11.0

WORKDIR /app

# Install additional dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/
COPY entrypoint.sh .
RUN chmod +x entrypoint.sh

# Download model during build
RUN python3 -c "from huggingface_hub import snapshot_download; snapshot_download('lightonai/LightOnOCR-2-1B-bbox-soup')"

# vLLM server port (internal) and FastAPI port (for local mode)
EXPOSE 8000 8001

# Override base image's ENTRYPOINT (which auto-starts vLLM)
# We want lazy loading via /load endpoint instead
ENTRYPOINT []
CMD ["./entrypoint.sh"]
