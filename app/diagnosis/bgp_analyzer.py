
import ipaddress


def analyze_bgp(router_data):
    output = router_data.get("bgp", {}).get("output", "")
    router_name = router_data.get("router", "unknown").upper()
    timestamp = router_data.get("collected_at")
    findings = []

    if not router_data.get("bgp", {}).get("success", False):
        err_msg = str(router_data.get("bgp", {}).get("error", "Could not collect BGP summary."))
        return [{
            "id": f"obs-bgp-{router_name.lower()}-col-fail",
            "observation_id": f"obs-bgp-{router_name.lower()}-col-fail",
            "source_type": "collection",
            "evidence_source": "bgp",
            "router": router_name,
            "router_id": router_name,
            "severity": "CRITICAL",
            "type": "BGP_COLLECTION_FAILURE",
            "collection_status": "failed",
            "timestamp": timestamp,
            "raw_evidence_reference": err_msg,
            "message": "Could not collect BGP summary.",
        }]

    found_neighbors = 0

    for line in output.splitlines():
        columns = line.split()

        # FRR neighbor rows start with an IP address and contain
        # the State/PfxRcd field at column index 9.
        if len(columns) < 10:
            continue

        try:
            ipaddress.ip_address(columns[0])
        except ValueError:
            continue

        if not columns[1].isdigit() or not columns[2].isdigit():
            continue

        neighbor_ip = columns[0]
        remote_as = int(columns[2])
        state = columns[9]
        found_neighbors += 1
        obs_id = f"obs-bgp-{router_name.lower()}-{neighbor_ip}"
        raw_ref = line.strip()[:200]

        if state.isdigit():
            if int(state) == 0:
                findings.append({
                    "id": f"{obs_id}-pfx0",
                    "observation_id": f"{obs_id}-pfx0",
                    "source_type": "bgp",
                    "evidence_source": "bgp",
                    "router": router_name,
                    "router_id": router_name,
                    "severity": "WARNING",
                    "type": "NO_PREFIXES_RECEIVED",
                    "neighbor": neighbor_ip,
                    "interface_or_peer_id": neighbor_ip,
                    "remote_as": remote_as,
                    "timestamp": timestamp,
                    "collection_status": "success",
                    "raw_evidence_reference": raw_ref,
                    "message": (
                        f"{router_name} receives zero prefixes "
                        f"from neighbor {neighbor_ip}."
                    ),
                })
        else:
            findings.append({
                "id": f"{obs_id}-{state.lower()}",
                "observation_id": f"{obs_id}-{state.lower()}",
                "source_type": "bgp",
                "evidence_source": "bgp",
                "router": router_name,
                "router_id": router_name,
                "severity": "CRITICAL",
                "type": "BGP_SESSION_NOT_ESTABLISHED",
                "neighbor": neighbor_ip,
                "interface_or_peer_id": neighbor_ip,
                "remote_as": remote_as,
                "state": state,
                "timestamp": timestamp,
                "collection_status": "success",
                "raw_evidence_reference": raw_ref,
                "message": (
                    f"BGP neighbor {neighbor_ip} on {router_name} "
                    f"is in state {state}, not Established."
                ),
            })

    if found_neighbors == 0 and "Total number of neighbors 0" not in output:
        findings.append({
            "id": f"obs-bgp-{router_name.lower()}-no-neighbors",
            "observation_id": f"obs-bgp-{router_name.lower()}-no-neighbors",
            "source_type": "bgp",
            "evidence_source": "bgp",
            "router": router_name,
            "router_id": router_name,
            "severity": "WARNING",
            "type": "NO_NEIGHBORS_PARSED",
            "timestamp": timestamp,
            "collection_status": "success",
            "raw_evidence_reference": output.strip()[:200],
            "message": "No BGP neighbor rows could be parsed.",
        })

    return findings
