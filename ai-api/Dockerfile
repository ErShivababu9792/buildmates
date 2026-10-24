# BuildMates server, LITE: no AI matching model, so it fits free 512 MB servers (Render, Koyeb).
# Chat guard, parent email, college ID, push, location and weekly digest all work. Matching uses keywords.
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=10000 EMBED_MODEL=off
WORKDIR /app

COPY requirements-lite.txt .
RUN pip install --no-cache-dir -r requirements-lite.txt

COPY . .
# Train the small chat-guard model at build time
RUN python train_guard.py

RUN useradd -m appuser && chown -R appuser /app
USER appuser
EXPOSE 10000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
