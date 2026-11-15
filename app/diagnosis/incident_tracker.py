
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
import json


PROJECT_ROOT = Path(__file__).resolve().parents[2]
INCIDENT_FILE = PROJECT_ROOT / "data" / "incident_history.json"


def utc_now():
    return datetime.now(timezone.utc).isoformat()

def next_incident_id(link, incidents):
    prefix = f"LINK-{link}-"

    existing_numbers = []

    for incident in incidents:
        incident_id = incident.get("incident_id", "")

        if incident_id.startswith(prefix):
            suffix = incident_id[len(prefix):]

            if suffix.isdigit():
                existing_numbers.append(int(suffix))

    next_number = max(existing_numbers, default=0) + 1

    return f"{prefix}{next_number:03d}"

def load_incident_history():
    if not INCIDENT_FILE.exists():
        return []

    try:
        with INCIDENT_FILE.open("r", encoding="utf-8") as file:
            data = json.load(file)

        if isinstance(data, list):
            return data

    except (json.JSONDecodeError, OSError):
        pass

    raise ValueError(
        "Incident history could not be read safely. "
        "Check data/incident_history.json before continuing."
    )


def save_incident_history(incidents):
    INCIDENT_FILE.parent.mkdir(parents=True, exist_ok=True)

    temp_file = INCIDENT_FILE.with_suffix(".tmp")

    with temp_file.open("w", encoding="utf-8") as file:
        json.dump(incidents, file, indent=2)

    temp_file.replace(INCIDENT_FILE)


def reconcile_incidents(current_candidates, incidents, observed_at=None,
                        telemetry_complete=True):
    """Return incident history updated from one complete telemetry snapshot."""
    incidents = deepcopy(incidents if isinstance(incidents, list) else [])
    if not telemetry_complete:
        return incidents

    now = observed_at or utc_now()

    seen_ids = set()

    for candidate in current_candidates:
        link = candidate.get("candidate_link")

        if not link:
            continue

        active_incident = next(
            (
                incident
                for incident in incidents
                if incident.get("candidate_link") == link
                and incident.get("status") == "ACTIVE"
            ),
            None,
        )

        if active_incident:
            incident_id = active_incident["incident_id"]
            seen_ids.add(incident_id)

            active_incident["last_observed_at"] = now
            active_incident["severity"] = candidate.get(
                "severity", active_incident.get("severity", "UNKNOWN")
            )
            active_incident["observations"] = candidate.get("observations", [])
            active_incident["affected_routers"] = candidate.get(
                "affected_routers", []
            )
            active_incident["evidence"] = candidate.get("evidence", "")
            active_incident["assessment"] = candidate.get("assessment", "")
            continue

        incident_id = next_incident_id(link, incidents)
        seen_ids.add(incident_id)

        incidents.append({
            "incident_id": incident_id,
            "candidate_link": link,
            "subnet": candidate.get("subnet"),
            "status": "ACTIVE",
            "severity": candidate.get("severity", "UNKNOWN"),
            "first_detected_at": now,
            "last_observed_at": now,
            "resolved_at": None,
            "affected_routers": candidate.get("affected_routers", []),
            "observations": candidate.get("observations", []),
            "evidence": candidate.get("evidence", ""),
            "assessment": candidate.get("assessment", ""),
        })

    for incident in incidents:
        if (
            incident.get("status") == "ACTIVE"
            and incident.get("incident_id") not in seen_ids
        ):
            incident["status"] = "RESOLVED"
            incident["resolved_at"] = now

    return incidents


def update_incident_history(current_candidates, telemetry_complete=True):
    """Update the local incident history only after complete collection."""
    incidents = load_incident_history()
    if not telemetry_complete:
        return incidents
    updated = reconcile_incidents(current_candidates, incidents)
    save_incident_history(updated)
    return updated
