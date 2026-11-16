"""Framework-independent NETSCOPE diagnosis pipeline."""
import os

from app.diagnosis.bgp_analyzer import analyze_bgp
from app.diagnosis.impact_analysis import analyze_impact
from app.diagnosis.measurements import analyze_interfaces, analyze_probes
from app.diagnosis.optional_model import compare_diagnosis
from app.diagnosis.root_cause import correlate_findings
from app.topology import load_topology


TOPOLOGY = load_topology()


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
    result = {
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
    result["optional_model"] = compare_diagnosis(result, os.environ.get("NETSCOPE_DIAGNOSIS_MODEL"))
    return result
