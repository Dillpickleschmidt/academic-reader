#!/bin/bash
set -e

start_vllm() {
    vllm serve lightonai/LightOnOCR-2-1B-bbox-soup \
        --dtype bfloat16 --max-model-len 8192 \
        --limit-mm-per-prompt '{"image": 1}' \
        --gpu-memory-utilization 0.9 \
        --served-model-name lightonocr \
        --mm-processor-cache-gb 0 --port 8000 &

    until curl -sf http://localhost:8000/v1/models > /dev/null 2>&1; do sleep 2; done
}

if [ "$MODE" = "local" ]; then
    # Local: vLLM starts on-demand via /load endpoint
    exec python -u -m uvicorn app.main:app --host 0.0.0.0 --port 8001
else
    # Runpod: Container spins up per-job, start vLLM immediately
    start_vllm
    exec python -u -m app.handler
fi
