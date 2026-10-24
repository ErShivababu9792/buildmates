"""
Translate the app into every language ONCE, ahead of time, so switching language is instant for every user.

    .venv\\Scripts\\python prepare_languages.py              → Indian languages first, then the rest (skips finished ones)
    .venv\\Scripts\\python prepare_languages.py --langs ta,bn → only these
    .venv\\Scripts\\python prepare_languages.py --redo        → translate again even if already done

Writes public/i18n/<lang>.json (ships with the website) and, if the Firebase admin key is set, Firestore translations/<lang>.
Safe to stop with Ctrl+C and run again: it continues where it stopped.
On an i3 laptop: about 1–4 minutes per language after the one-time model download (~2.5 GB).
"""
import argparse
import os
import sys
import time

os.environ.setdefault("EMBED_MODEL", "hash")  # don't load the matching model, we only translate here
try:
    from dotenv import load_dotenv
    here = os.path.dirname(os.path.abspath(__file__))
    load_dotenv(os.path.join(here, ".env"))
    load_dotenv(os.path.join(here, "..", ".env"))
except ImportError:
    pass

import i18n_api as T  # noqa: E402

INDIAN_FIRST = ["hi", "bn", "te", "mr", "ta", "ur", "gu", "kn", "ml", "or", "pa", "as", "mai", "sa", "ne", "sd", "ks", "mni", "bho", "mag", "hne", "awa"]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--langs", default="", help="comma separated, e.g. ta,bn,te (default: all)")
    ap.add_argument("--redo", action="store_true", help="translate again even if the file is up to date")
    args = ap.parse_args()

    src, version = T.load_source()
    langs = [l.strip() for l in args.langs.split(",") if l.strip()] or (INDIAN_FIRST + [l for l in T.NLLB if l not in INDIAN_FIRST])
    bad = [l for l in langs if l not in T.NLLB]
    if bad:
        sys.exit(f"Unknown language code(s): {', '.join(bad)}. Available: {', '.join(T.NLLB)}")

    print(f"Engine: {T.PROVIDER} ({T.NLLB_MODEL if T.PROVIDER != 'google' else 'Google Cloud'}) · {len(src)} strings · {len(langs)} languages")
    print(f"Saving to: {os.path.abspath(T.STATIC_DIR)}" + (" + Firestore" if T.admin_app() is not None else " (no Firebase admin key: Firestore skipped)"))
    done = 0
    for i, lang in enumerate(langs, 1):
        if not args.redo and T.static_version(lang) == version:
            print(f"[{i}/{len(langs)}] {lang}: already up to date, skipped")
            continue
        t0 = time.time()

        def progress(p, lang=lang, i=i):
            print(f"\r[{i}/{len(langs)}] {lang}: {round(p * 100):3d}%", end="", flush=True)

        def stage(s, lang=lang, i=i):
            if s == "loading":
                print(f"[{i}/{len(langs)}] {lang}: loading the translation model (first time downloads ~2.5 GB)…", flush=True)

        strings = T.translate_table(src, lang, progress, stage)
        T.save_translation(lang, strings, version)
        done += 1
        print(f"\r[{i}/{len(langs)}] {lang}: done in {time.time() - t0:.0f}s        ")
    print(f"Finished. {done} language(s) translated. Restart `npm run dev` or redeploy so the website includes them.")


if __name__ == "__main__":
    main()
