"""Framework-independent NETSCOPE diagnosis pipeline."""
import os
from datetime import datetime, timezone

from app.collector.validation import telemetry_collection_complete
from app.diagnosis.bgp_analyzer import analyze_bgp
from app.diagnosis.impact_analysis import analyze_impact
from app.diagnosis.measurements import analyze_interfaces, analyze_probes, summarize_syslog
from app.diagnosis.optional_model import compare_diagnosis
from app.diagnosis.root_cause import correlate_findings
from app.topology import load_topology


TOPOLOGY = load_topology()


def build_diagnosis(snapshot):
    routers = snapshot.get("routers", [])
    if not isinstance(routers, list):
        raise ValueError("Unexpected telemetry snapshot format")

    topology = snapshot.get("topology") or TOPOLOGY
    collected_at = snapshot.get("collected_at")

    # Data Quality Validation
    timestamp_valid = False
    is_stale = False
    age_seconds = None
    if isinstance(collected_at, str):
        try:
            observed = datetime.fromisoformat(collected_at.replace("Z", "+00:00"))
            if observed.tzinfo is not None:
                timestamp_valid = True
                age_seconds = (datetime.now(timezone.utc) - observed).total_seconds()
                if age_seconds < -60 or age_seconds > 300:
                    is_stale = True
        except (ValueError, TypeError):
            timestamp_valid = False

    expected_routers = {r["id"] for r in topology["routers"]}
    collected_routers = {r.get("router", "").lower() for r in routers if isinstance(r, dict)}
    missing_routers = sorted(expected_routers - collected_routers)
    failed_routers = [r.get("router", "").upper() for r in routers if isinstance(r, dict) and not r.get("healthy_collection")]
    incomplete_collection = bool(missing_routers or failed_routers or not telemetry_collection_complete(snapshot))

    findings = []
    for router_data in routers:
        if isinstance(router_data, dict):
            findings.extend(analyze_bgp(router_data))

    findings.extend(analyze_interfaces(routers, topology))
    findings.extend(analyze_probes(snapshot.get("measurements", [])))
    syslog_events = snapshot.get("syslog_events")
    if syslog_events is None:
        syslog_events = summarize_syslog(routers)

    correlated = correlate_findings(findings, topology, syslog_events, snapshot=snapshot)
    impact = analyze_impact(correlated, topology, snapshot=snapshot, findings=findings)

    # Determine explicit diagnostic outcome & abstention
    if incomplete_collection and (not correlated or correlated[0]['score'] < 8):
        outcome = "INSUFFICIENT_TELEMETRY"
        abstention_reason = "Incomplete telemetry collection: one or more routers failed to report or collection commands encountered errors."
    elif not correlated or correlated[0]['score'] < 1:
        outcome = "INSUFFICIENT_EVIDENCE"
        abstention_reason = "Available telemetry does not support a specific fault conclusion. Check collection coverage, router logs, active probes and timestamps."
    elif (len(correlated) >= 2 and correlated[0]['score'] == correlated[1]['score'] and correlated[0]['score'] >= 4
          and len(set(correlated[0].get('affected_routers', [])).intersection(correlated[1].get('affected_routers', []))) == 0):
        outcome = "AMBIGUOUS_HYPOTHESES"
        abstention_reason = "Multiple competing candidate hypotheses have equal diagnostic support without decisive distinguishing telemetry."
    else:
        outcome = "DIAGNOSIS"
        abstention_reason = None

    # Separate supporting, contradicting, and missing evidence
    supporting_evidence = [f for f in findings if f.get('type') != 'ACTIVE_PROBE_UNAVAILABLE' and not str(f.get('type', '')).endswith('_FAILURE')]
    contradicting_evidence = [item for c in correlated for item in c.get('contradicting_evidence', [])]
    missing_evidence = [f for f in findings if f.get('type') == 'ACTIVE_PROBE_UNAVAILABLE' or str(f.get('type', '')).endswith('_FAILURE')]

    result = {
        "schema_version": 1,
        "engine_version": "netscope-engine/1.0.0",
        "scenario_id": snapshot.get("scenario_id") or snapshot.get("scenario", {}).get("id"),
        "snapshot_timestamp": collected_at,
        "observed_at": collected_at,
        "outcome": outcome,
        "diagnosis_status": "ranked_hypotheses" if outcome == "DIAGNOSIS" else "insufficient_evidence",
        "abstention_reason": abstention_reason,
        "unsupported_conclusion": abstention_reason,
        "routers_analyzed": len(routers),
        "finding_count": len(findings),
        "findings": findings,
        "candidate_root_causes": correlated,
        "ranked_hypotheses": correlated,
        "supporting_evidence": supporting_evidence,
        "contradicting_evidence": contradicting_evidence,
        "missing_evidence": missing_evidence,
        "data_quality": {
            "timestamp_valid": timestamp_valid,
            "is_stale": is_stale,
            "age_seconds": round(age_seconds, 1) if age_seconds is not None else None,
            "missing_routers": missing_routers,
            "failed_routers": failed_routers,
            "incomplete_collection": incomplete_collection
        },
        "coverage": {
            "routers_total": len(topology["routers"]),
            "routers_collected": sum(1 for item in routers if item.get("healthy_collection") is True),
            "links_total": len(topology["links"]),
            "links_measured": sum(1 for item in snapshot.get("measurements", []) if any(p.get("available") for p in item.get("observations", []))),
            "syslog_events": len(syslog_events)
        },
        "syslog_events": syslog_events,
        "measurements": snapshot.get("measurements", []),
        "impact_analysis": impact,
    }
    result["optional_model"] = compare_diagnosis(result, os.environ.get("NETSCOPE_DIAGNOSIS_MODEL"))
    return result
