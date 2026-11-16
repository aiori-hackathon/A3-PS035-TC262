
from pathlib import Path
import json

from flask import Flask, jsonify
from app.api.security import install_security
from app.api.live import live

from app.collector.telemetry import collect_snapshot, save_snapshot
from app.diagnosis.engine import build_diagnosis
from app.collector.validation import telemetry_collection_complete
from app.diagnosis.incident_tracker import update_incident_history

app = Flask(__name__)
install_security(app)
app.register_blueprint(live)
from app.api.telemetry_store import telemetry_ingest
app.register_blueprint(telemetry_ingest)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"


def load_latest_telemetry():
    snapshots = sorted(DATA_DIR.glob("telemetry_*.json"))

    if not snapshots:
        return None

    with snapshots[-1].open("r", encoding="utf-8") as file:
        return json.load(file)

@app.get("/api/health")
def health():
    return jsonify({
        "status": "ok",
        "service": "PS-035 Network Diagnosis API",
    })


@app.get("/api/telemetry")
def telemetry():
    snapshot = load_latest_telemetry()

    if snapshot is None:
        return jsonify({"error": "No telemetry snapshot found"}), 404

    return jsonify(snapshot)


@app.get("/api/diagnosis")
def diagnosis():
    snapshot = load_latest_telemetry()

    if snapshot is None:
        return jsonify({"error": "No telemetry snapshot found"}), 404

    try:
        return jsonify(build_diagnosis(snapshot))
    except ValueError as error:
        return jsonify({"error": str(error)}), 500

@app.get("/api/incidents")
def incidents():
    try:
        return jsonify({
            "incidents": update_incident_history(
                [],
                telemetry_complete=False,
            )
        })
    except (ValueError, OSError) as error:
        app.logger.exception("Incident history could not be loaded")
        return jsonify({
            "error": "Incident history could not be loaded."
        }), 500
@app.post("/api/refresh")
def refresh():
    """Collect fresh router telemetry and return the updated diagnosis."""
    try:
        snapshot = collect_snapshot()
        output_file = save_snapshot(snapshot)
        result = build_diagnosis(snapshot)
        result["incidents"] = update_incident_history(
            result["candidate_root_causes"],
            telemetry_complete=telemetry_collection_complete(snapshot),
        )
        result["collection"] = {
            "status": "completed",
            "routers_ok": sum(
                1 for router in snapshot["routers"]
                if router.get("healthy_collection", False)
            ),
            "routers_total": len(snapshot["routers"]),
            "snapshot_file": str(
                output_file.relative_to(PROJECT_ROOT)
            ),
        }

        return jsonify(result)

    except Exception:
        app.logger.exception("Telemetry refresh failed")
        return jsonify({
            "error": "Telemetry refresh failed. Check the backend logs."
        }), 500


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)
