
from pathlib import Path
import json

from flask import Flask, jsonify
from app.api.security import install_security
from app.api.live import live

from app.collector.telemetry import collect_snapshot, save_snapshot
from app.diagnosis.bgp_analyzer import analyze_bgp
from app.diagnosis.root_cause import correlate_findings
from app.diagnosis.impact_analysis import analyze_impact
from app.diagnosis.measurements import analyze_interfaces, analyze_probes
from app.topology import load_topology
from app.diagnosis.incident_tracker import update_incident_history

app = Flask(__name__)
install_security(app)
app.register_blueprint(live)
from app.api.telemetry_store import telemetry_ingest
app.register_blueprint(telemetry_ingest)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
TOPOLOGY = load_topology()
DATA_DIR = PROJECT_ROOT / "data"


def load_latest_telemetry():
    snapshots = sorted(DATA_DIR.glob("telemetry_*.json"))

    if not snapshots:
        return None

    with snapshots[-1].open("r", encoding="utf-8") as file:
        return json.load(file)

def telemetry_collection_complete(snapshot):
    routers = snapshot.get("routers", [])
    topology = snapshot.get("topology") or TOPOLOGY
    expected_routers = {item["id"] for item in topology["routers"]}
    collected_routers = {
        router.get("router", "").lower()
        for router in routers
        if isinstance(router, dict)
    }

    return (
        collected_routers == expected_routers
        and len(routers) == len(expected_routers)
        and all(
            isinstance(router, dict)
            and router.get("healthy_collection") is True
            and router.get("bgp", {}).get("success") is True
            for router in routers
        )
    )
def build_diagnosis(snapshot):
    routers = snapshot.get("routers", [])

    if not isinstance(routers, list):
        raise ValueError("Unexpected telemetry snapshot format")

    topology = snapshot.get("topology") or TOPOLOGY
    findings = []

    for router_data in routers:
        if isinstance(router_data, dict):
            findings.extend(analyze_bgp(router_data))

    findings.extend(analyze_interfaces(routers, topology))
    findings.extend(analyze_probes(snapshot.get("measurements", [])))
    syslog_events = snapshot.get("syslog_events", [])
    correlated = correlate_findings(findings, topology, syslog_events)
    impact = analyze_impact(correlated, topology)

    return {
        "snapshot_timestamp": snapshot.get("collected_at"),
        "routers_analyzed": len(routers),
        "finding_count": len(findings),
        "findings": findings,
        "candidate_root_causes": correlated,
        "diagnosis_status": "ranked_hypotheses" if correlated else "insufficient_evidence",
        "unsupported_conclusion": None if correlated else "Available telemetry does not support a specific fault conclusion. Check collection coverage, router logs, active probes and timestamps.",
        "coverage": {"routers_total": len(topology["routers"]), "routers_collected": sum(1 for item in routers if item.get("healthy_collection") is True),
                     "links_total": len(topology["links"]), "links_measured": sum(1 for item in snapshot.get("measurements", []) if any(p.get("available") for p in item.get("observations", []))),
                     "syslog_events": len(syslog_events)},
        "syslog_events": syslog_events,
        "measurements": snapshot.get("measurements", []),
        "impact_analysis": impact,
    }


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
