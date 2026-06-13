FROM pytorch/pytorch:2.8.0-cuda12.8-cudnn9-runtime

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/

RUN python -c "from marker.models import create_model_dict; create_model_dict()"
RUN python -c "import os, urllib.request; from marker.settings import settings; os.makedirs(settings.FONT_DIR, exist_ok=True); font_url = f'{settings.ARTIFACT_URL}/{settings.FONT_NAME}'; font_path = os.path.join(settings.FONT_DIR, settings.FONT_NAME); req = urllib.request.Request(font_url, headers={'User-Agent': 'Mozilla/5.0'}); open(font_path, 'wb').write(urllib.request.urlopen(req).read())"

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
