"""
Train the BuildMates Hinglish Chat Guard.

    python train_guard.py

Reads  data/guard_dataset.csv  (columns: text,label)
Writes models/guard.joblib     (the trained model)
       models/metrics.json     (accuracy, precision, recall, F1 – use these in your report)

Labels: safe, contact (phone/social ID), money, abuse, flirt
Model : character n-gram TF-IDF + Logistic Regression.
        Character n-grams cope with Hinglish spelling ("number", "nmbr", "numbr") much better than word models.
"""
import csv
import json
import os
from datetime import datetime, timezone

import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.pipeline import FeatureUnion, Pipeline

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data", "guard_dataset.csv")
OUT_DIR = os.path.join(HERE, "models")


def load():
    texts, labels = [], []
    with open(DATA, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row["text"].strip():
                texts.append(row["text"].strip().lower())
                labels.append(row["label"].strip())
    return texts, labels


def char_model():
    """Our model: character + word n-grams."""
    features = FeatureUnion([
        ("chars", TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5), min_df=1, sublinear_tf=True)),
        ("words", TfidfVectorizer(analyzer="word", ngram_range=(1, 2), min_df=1, sublinear_tf=True)),
    ])
    return Pipeline([
        ("features", features),
        ("clf", LogisticRegression(max_iter=2000, C=8, class_weight="balanced")),
    ])


def word_baseline():
    """Baseline for comparison: plain word unigrams (how a typical English-only filter works)."""
    return Pipeline([
        ("features", TfidfVectorizer(analyzer="word", ngram_range=(1, 1))),
        ("clf", LogisticRegression(max_iter=2000, class_weight="balanced")),
    ])


def main():
    texts, labels = load()
    print(f"Loaded {len(texts)} examples")

    x_train, x_test, y_train, y_test = train_test_split(texts, labels, test_size=0.2, random_state=42, stratify=labels)
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

    results = {}
    for name, factory in [("hinglish_char_model", char_model), ("word_baseline", word_baseline)]:
        model = factory()
        model.fit(x_train, y_train)
        pred = model.predict(x_test)
        cv_scores = cross_val_score(factory(), texts, labels, cv=cv, scoring="f1_macro")
        results[name] = {
            "test_accuracy": round(accuracy_score(y_test, pred), 4),
            "test_report": classification_report(y_test, pred, output_dict=True, zero_division=0),
            "cv_f1_macro_mean": round(float(cv_scores.mean()), 4),
            "cv_f1_macro_std": round(float(cv_scores.std()), 4),
        }
        print(f"\n=== {name} ===")
        print(classification_report(y_test, pred, zero_division=0))
        print(f"5-fold macro F1: {cv_scores.mean():.3f} ± {cv_scores.std():.3f}")

    final = char_model().fit(x_train, y_train)
    classes = list(final.classes_)
    results["hinglish_char_model"]["confusion_matrix"] = {
        "labels": classes, "matrix": confusion_matrix(y_test, final.predict(x_test), labels=classes).tolist(),
    }

    # Ship a model trained on all data
    model = char_model().fit(texts, labels)
    os.makedirs(OUT_DIR, exist_ok=True)
    joblib.dump(model, os.path.join(OUT_DIR, "guard.joblib"))
    results["trained_on"] = len(texts)
    results["trained_at"] = datetime.now(timezone.utc).isoformat()
    with open(os.path.join(OUT_DIR, "metrics.json"), "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print(f"\nSaved models/guard.joblib and models/metrics.json")


if __name__ == "__main__":
    main()
