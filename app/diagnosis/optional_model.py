"""Opt-in, explainable Naive Bayes comparison trained only on labeled lab runs."""
from collections import Counter
import json
import math
from pathlib import Path
import re
from app.topology import load_topology

MODEL_SCHEMA_VERSION = 1
NO_FAULT = "__NO_SUPPORTED_FAULT__"


def _normal(value):
    return re.sub(r"[^a-z0-9_]+", "_", str(value or "").strip().lower()).strip("_")


def diagnosis_features(value):
    """Return coarse symptoms only; candidate link labels are never features."""
    diagnosis = value.get("diagnosis", value) if isinstance(value, dict) else {}
    features = set()
    for finding in diagnosis.get("findings", []):
        if not isinstance(finding, dict):
            continue
        kind, router, severity = map(_normal, (finding.get("type"), finding.get("router"), finding.get("severity")))
        if kind:
            features.add(f"finding:{kind}")
            if router:
                features.add(f"router_finding:{router}:{kind}")
        if severity:
            features.add(f"severity:{severity}")
    for event in diagnosis.get("syslog_events", []):
        if not isinstance(event, dict):
            continue
        kind, router = map(_normal, (event.get("event_type"), event.get("router")))
        if kind:
            features.add(f"log:{kind}")
            if router:
                features.add(f"router_log:{router}:{kind}")
    coverage = diagnosis.get("coverage", {})
    for label, collected, total in (
        ("routers", coverage.get("routers_collected"), coverage.get("routers_total")),
        ("links", coverage.get("links_measured"), coverage.get("links_total")),
    ):
        if isinstance(collected, int) and isinstance(total, int) and total > 0:
            features.add(f"coverage:{label}:{'complete' if collected >= total else 'partial'}")
    for link in diagnosis.get("measurements", []):
        if not isinstance(link, dict):
            continue
        for probe in link.get("observations", []):
            if not isinstance(probe, dict):
                continue
            router = _normal(probe.get("router"))
            if not probe.get("available"):
                features.add("probe:unavailable")
                if router:
                    features.add(f"probe_source:{router}:unavailable")
                continue
            loss = probe.get("packet_loss_percent")
            loss_band = "unknown" if not isinstance(loss, (int, float)) else "none" if loss == 0 else "partial" if loss < 100 else "total"
            features.add(f"probe:loss:{loss_band}")
            if router:
                features.add(f"probe_source:{router}:loss:{loss_band}")
            rtt = probe.get("rtt_avg_ms")
            rtt_band = "unknown" if not isinstance(rtt, (int, float)) else "normal" if rtt < 100 else "elevated"
            features.add(f"probe:rtt:{rtt_band}")
    return features


def train_model(records, minimum_examples_per_class=3):
    """Train from non-held-out labels; held-out examples are ignored by design."""
    if not isinstance(minimum_examples_per_class, int) or minimum_examples_per_class < 1:
        raise ValueError("Minimum examples per class must be a positive integer.")
    allowed_labels = {item["id"] for item in load_topology()["links"]}
    examples = []
    run_ids = set()
    for record in records:
        if not isinstance(record, dict) or record.get("held_out") is not False:
            continue
        if "expected_candidate_link" not in record:
            continue
        label = record["expected_candidate_link"]
        if label is not None and (not isinstance(label, str) or label not in allowed_labels):
            continue
        run_id = record.get("run_id")
        if isinstance(run_id, str) and run_id:
            if run_id in run_ids:
                continue
            run_ids.add(run_id)
        features = diagnosis_features(record)
        if features:
            examples.append((label or NO_FAULT, features))
    counts = Counter(label for label, _ in examples)
    if NO_FAULT not in counts or len(counts) < 3:
        raise ValueError("Training requires at least two fault-link classes plus labeled no-supported-fault runs.")
    sparse = {label: count for label, count in counts.items() if count < minimum_examples_per_class}
    if sparse:
        raise ValueError(f"Each outcome class needs {minimum_examples_per_class} usable training runs; sparse classes: {sparse}.")
    vocabulary = sorted(set().union(*(features for _, features in examples)))
    class_rows = {}
    for label in sorted(counts):
        selected = [features for candidate, features in examples if candidate == label]
        feature_counts = Counter(feature for features in selected for feature in features)
        class_rows[label] = {"runs": len(selected), "feature_counts": dict(feature_counts)}
    return {
        "schema_version": MODEL_SCHEMA_VERSION,
        "algorithm": "bernoulli_naive_bayes",
        "training_runs": len(examples),
        "minimum_examples_per_class": minimum_examples_per_class,
        "vocabulary": vocabulary,
        "classes": class_rows,
        "score_semantics": "relative_model_score_not_calibrated_probability",
    }


def load_model(path):
    model = json.loads(Path(path).read_text(encoding="utf-8"))
    if (not isinstance(model, dict) or model.get("schema_version") != MODEL_SCHEMA_VERSION
            or model.get("algorithm") != "bernoulli_naive_bayes"
            or not isinstance(model.get("vocabulary"), list)
            or not isinstance(model.get("classes"), dict) or len(model["classes"]) < 2):
        raise ValueError("Optional diagnosis model has an unsupported format.")
    if len(model["vocabulary"]) > 5000 or len(model["classes"]) > 100:
        raise ValueError("Optional diagnosis model exceeds supported bounds.")
    if not all(isinstance(item, str) for item in model["vocabulary"]):
        raise ValueError("Optional diagnosis model vocabulary is invalid.")
    vocabulary = set(model["vocabulary"])
    if (len(vocabulary) != len(model["vocabulary"])
            or not isinstance(model.get("training_runs"), int) or model["training_runs"] < 1
            or model.get("score_semantics") != "relative_model_score_not_calibrated_probability"):
        raise ValueError("Optional diagnosis model metadata is invalid.")
    for label, item in model["classes"].items():
        if not isinstance(item, dict):
            raise ValueError("Optional diagnosis model class data is invalid.")
        counts = item.get("feature_counts") if isinstance(item, dict) else None
        if (not isinstance(label, str) or not isinstance(item.get("runs"), int) or item["runs"] < 1
                or not isinstance(counts, dict) or any(feature not in vocabulary or not isinstance(count, int) or count < 0 or count > item["runs"] for feature, count in counts.items())):
            raise ValueError("Optional diagnosis model class data is invalid.")
    if NO_FAULT not in model["classes"] or sum(item["runs"] for item in model["classes"].values()) != model["training_runs"]:
        raise ValueError("Optional diagnosis model must contain consistent fault and no-fault classes.")
    minimum = model.get("minimum_examples_per_class")
    if (len(set(model["classes"]) - {NO_FAULT}) < 2 or not isinstance(minimum, int) or minimum < 1
            or any(item["runs"] < minimum for item in model["classes"].values())):
        raise ValueError("Optional diagnosis model does not meet its stored class minimums.")
    return model


def predict(model, diagnosis):
    features = diagnosis_features(diagnosis)
    if not features:
        return {"status": "abstained", "reason": "No usable symptom features were recorded.", "predictions": [], "explanation": []}
    vocabulary = set(model["vocabulary"])
    known = features & vocabulary
    if not known:
        return {"status": "abstained", "reason": "Recorded symptoms are outside the model's training vocabulary.", "predictions": [], "explanation": []}
    labels = model["classes"]
    total = sum(item["runs"] for item in labels.values())
    scores = {}
    for label, item in labels.items():
        prior = item["runs"] / total
        score = math.log(prior)
        for feature in vocabulary:
            probability = (item["feature_counts"].get(feature, 0) + 1) / (item["runs"] + 2)
            score += math.log(probability if feature in known else 1 - probability)
        scores[label] = score
    maximum = max(scores.values())
    exp_scores = {label: math.exp(score - maximum) for label, score in scores.items()}
    normalizer = sum(exp_scores.values())
    predictions = [{"candidate_link": label, "relative_score": round(value / normalizer, 4)}
                   for label, value in sorted(exp_scores.items(), key=lambda row: (-row[1], row[0]))
                   if label != NO_FAULT][:3]
    winner = max(scores, key=scores.get)
    if winner == NO_FAULT:
        return {"status": "abstained", "reason": "The model ranked the no-supported-fault class first.", "predictions": predictions,
                "explanation": sorted(known)[:6]}
    return {"status": "available", "reason": "Experimental comparison only; verify against the rule baseline and source observations.",
            "predictions": predictions, "explanation": sorted(known)[:6]}


def compare_diagnosis(diagnosis, model_path=None):
    if not model_path:
        return {"status": "not_configured", "reason": "No trained optional model is configured; the rule-based baseline remains active.", "predictions": [], "explanation": []}
    try:
        model = load_model(model_path)
        result = predict(model, diagnosis)
        result["algorithm"] = model["algorithm"]
        result["training_runs"] = model["training_runs"]
        result["score_semantics"] = model["score_semantics"]
        return result
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError, ArithmeticError):
        return {"status": "unavailable", "reason": "Optional model could not be loaded; the rule-based baseline remains active.", "predictions": [], "explanation": []}
