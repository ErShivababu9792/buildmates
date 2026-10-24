# BuildMates AI API – Docker image for Hugging Face Spaces (free CPU) or Render
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 HF_HOME=/app/.cache PORT=7860
WORKDIR /app

# CPU-only PyTorch keeps the image small
RUN pip install --no-cache-dir torch==2.5.1 --index-url https://download.pytorch.org/whl/cpu
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
# Train the guard and download the embedding model at build time, so the first request is fast
RUN python train_guard.py \
 && python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2')"

RUN useradd -m appuser && chown -R appuser /app
USER appuser
EXPOSE 7860
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
