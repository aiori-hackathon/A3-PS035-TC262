import unittest
import json
from tempfile import TemporaryDirectory
from pathlib import Path

from app.diagnosis.optional_model import compare_diagnosis, diagnosis_features, train_model, predict, load_model
from tools.evaluate_runs import evaluate_optional_model


def run(label, kind, router, held_out=False):
    return {
        "held_out": held_out,
        "expected_candidate_link": label,
        "diagnosis": {
            "findings": ([{"type": kind, "router": router, "severity": "CRITICAL", "link": "LEAK-ME"}] if kind else []),
            "syslog_events": [], "coverage": {"routers_collected": 5, "routers_total": 5, "links_measured": 5, "links_total": 5},
            "measurements": [{"observations": [{"router": "R5", "available": True, "packet_loss_percent": 0, "rtt_avg_ms": 2}]}],
        },
    }


class OptionalModelTests(unittest.TestCase):
    def test_features_use_symptoms_and_exclude_candidate_link_fields(self):
        features = diagnosis_features(run("R1-R2", "BGP_SESSION_NOT_ESTABLISHED", "R1"))
        self.assertIn("finding:bgp_session_not_established", features)
        self.assertIn("router_finding:r1:bgp_session_not_established", features)
        self.assertFalse(any("R1-R2" in feature or "LEAK" in feature for feature in features))

    def test_training_ignores_held_out_records_and_requires_repeated_classes(self):
        records = [run("R1-R2", "BGP_SESSION_NOT_ESTABLISHED", "R1") for _ in range(2)]
        records += [run("R2-R4", "INTERFACE_NOT_UP", "R2") for _ in range(2)]
        records += [run(None, "", "") for _ in range(2)]
        records.append(run("R3-R4", "ACTIVE_PROBE_PACKET_LOSS", "R3", held_out=True))
        model = train_model(records, minimum_examples_per_class=2)
        self.assertEqual(model["training_runs"], 6)
        self.assertEqual(set(model["classes"]), {"R1-R2", "R2-R4", "__NO_SUPPORTED_FAULT__"})
        with self.assertRaisesRegex(ValueError, "sparse classes"):
            train_model(records, minimum_examples_per_class=3)

    def test_prediction_ranks_match_and_abstains_without_known_evidence(self):
        records = [run("R1-R2", "BGP_SESSION_NOT_ESTABLISHED", "R1") for _ in range(3)]
        records += [run("R2-R4", "INTERFACE_NOT_UP", "R2") for _ in range(3)]
        records += [run(None, "", "") for _ in range(3)]
        model = train_model(records)
        diagnosis = {"findings": [{"type": "BGP_SESSION_NOT_ESTABLISHED", "router": "R1"}]}
        result = predict(model, diagnosis)
        self.assertEqual(result["status"], "available")
        self.assertEqual(result["predictions"][0]["candidate_link"], "R1-R2")
        self.assertGreaterEqual(result["predictions"][0]["relative_score"], result["predictions"][-1]["relative_score"])
        self.assertEqual(predict(model, {"findings": []})["status"], "abstained")

    def test_disabled_or_invalid_model_never_blocks_rule_baseline(self):
        self.assertEqual(compare_diagnosis({"findings": []})["status"], "not_configured")
        self.assertEqual(compare_diagnosis({"findings": []}, "/path/that/does/not/exist")["status"], "unavailable")

    def test_optional_model_metrics_use_only_held_out_runs(self):
        training = [run("R1-R2", "BGP_SESSION_NOT_ESTABLISHED", "R1") for _ in range(3)]
        training += [run("R2-R4", "INTERFACE_NOT_UP", "R2") for _ in range(3)]
        training += [run(None, "", "") for _ in range(3)]
        model = train_model(training)
        held_out = [run("R1-R2", "BGP_SESSION_NOT_ESTABLISHED", "R1", held_out=True), run(None, "", "", held_out=True)]
        metrics = evaluate_optional_model(held_out, model)
        self.assertEqual(metrics["held_out_records"], 2)
        self.assertEqual(metrics["fault_cases"], 1)

    def test_model_artifact_round_trip_is_opt_in(self):
        training = [run("R1-R2", "BGP_SESSION_NOT_ESTABLISHED", "R1") for _ in range(3)]
        training += [run("R2-R4", "INTERFACE_NOT_UP", "R2") for _ in range(3)]
        training += [run(None, "", "") for _ in range(3)]
        model = train_model(training)
        diagnosis = {"findings": [{"type": "BGP_SESSION_NOT_ESTABLISHED", "router": "R1"}]}
        with TemporaryDirectory() as directory:
            path = Path(directory) / "model.json"
            path.write_text(json.dumps(model), encoding="utf-8")
            self.assertEqual(load_model(path), model)
            self.assertEqual(compare_diagnosis(diagnosis, path)["status"], "available")


if __name__ == "__main__":
    unittest.main()
