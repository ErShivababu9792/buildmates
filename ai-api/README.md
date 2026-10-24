---
title: BuildMates AI API
emoji: 🤝
colorFrom: green
colorTo: yellow
sdk: docker
app_port: 7860
pinned: false
---

# BuildMates AI API (Python · FastAPI)

The "brain" of BuildMates.

| Endpoint | What it does |
|---|---|
| `GET /health` | Is the server up, which models are loaded |
| `POST /embed` | Turns a student's vision into 384 numbers that capture its **meaning** (multilingual: English, Hindi, Hinglish). Used for AI matching. |
| `POST /guard` | Checks a chat message: exact safety rules first, then a **trained Hinglish classifier** (safe / contact / money / abuse / flirt). |
| `POST /idea-check` | Warns before an idea is posted (banned ideas, giving away the secret solution). |

Every POST needs the user's Firebase login token, so only signed-in BuildMates users can use it. Each user gets 60 requests per minute.

## Models
- **Matching:** `paraphrase-multilingual-MiniLM-L12-v2` (Sentence Transformers), cosine similarity.
- **Chat Guard:** character + word n-gram TF-IDF → Logistic Regression, trained on `data/guard_dataset.csv`.
  Results are written to `models/metrics.json` when you train. On the current dataset (397 messages, 80/20 split):

| Model | Accuracy | Macro F1 (5-fold) |
|---|---|---|
| Our Hinglish char-n-gram model | 0.96 | 0.97 |
| Word-only baseline | 0.93 | 0.915 |

> Honest note for the report: the dataset is small and partly augmented, so these numbers are optimistic. Add real (anonymised) messages from the pilot to `data/guard_dataset.csv` and re-train for stronger results.

---

## Run it on your laptop (Windows)

Open a **new terminal in VS Code** and go into this folder:
```
cd ai-api
```
1. Create a private Python space (one time):
```
python -m venv .venv
.venv\Scripts\activate
```
   You'll see `(.venv)` at the start of the line.
2. Install (one time, ~5–10 minutes, needs ~1.5 GB):
```
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
```
3. Settings: copy `.env.example` to `.env` and set `FIREBASE_PROJECT_ID` (same as in the web app's .env).
4. Train the chat guard:
```
python train_guard.py
```
5. Start the server:
```
uvicorn main:app --reload --port 8000
```
   Open http://localhost:8000/health → `"ok": true`. The first `/embed` call downloads the AI model (~470 MB) once.
6. In the **web app's** `.env` add:
```
VITE_AI_API_URL=http://localhost:8000
```
   and restart `npm run dev`.

Next time you only need steps: `cd ai-api` → `.venv\Scripts\activate` → `uvicorn main:app --reload --port 8000`.

## Put it online for free (Hugging Face Spaces)
1. Create an account at https://huggingface.co → **New Space** → name `buildmates-ai` → SDK **Docker** → **Blank** → Public → Create.
2. Upload every file in this `ai-api` folder **except** `.venv`, `.env` and `.cache` (Files → Add file → Upload).
3. Space → **Settings → Variables and secrets** → add:
   - `FIREBASE_PROJECT_ID` = your project id
   - `ALLOWED_ORIGINS` = `http://localhost:5173,https://your-site.vercel.app`
4. Wait for the build (~10 min). Your API URL is `https://<your-username>-buildmates-ai.hf.space`.
5. Put that URL in `VITE_AI_API_URL` (web app `.env` and Vercel environment variables).

The free Space sleeps after a while without use; the first request then takes ~30 seconds. The app keeps working meanwhile using its built-in rules.
