FROM pytorch/pytorch:2.8.0-cuda12.8-cudnn9-runtime

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    espeak-ng \
    && rm -rf /var/lib/apt/lists/*

COPY workers/kokoro-tts/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

RUN python -c "from kokoro import KPipeline; voices = ['af_heart', 'af_bella', 'am_adam']; p = KPipeline(lang_code='a', repo_id='hexgrad/Kokoro-82M'); [p.load_voice(voice) for voice in voices]"

COPY workers/kokoro-tts/core/ ./core/
COPY workers/kokoro-tts/app/ ./app/

EXPOSE 8801

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8801"]
