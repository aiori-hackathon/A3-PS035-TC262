from collections import deque

from app.diagnosis.root_cause import LINKS
from app.topology import load_topology


def analyze_impact(incidents, topology_config=None):
    """
    Estimate network impact using the known topology.

    This is topology-based analysis, not proof of live route reachability.
    """
    configured = topology_config or load_topology()
    routers = {item["id"] for item in configured["routers"]}
    topology = {router: set() for router in routers}

    for link in configured["links"]:
        left, right = link["a"], link["b"]
        topology[left].add(right)
        topology[right].add(left)

    failed_links = set()

    for incident in incidents:
        if incident.get("score", 0) < 4:
            continue
        candidate = incident.get("candidate_link", "")
        parts = candidate.lower().split("-")

        if len(parts) == 2:
            failed_links.add(frozenset(parts))

    available = {router: set() for router in routers}

    for router, neighbors in topology.items():
        for neighbor in neighbors:
            if frozenset((router, neighbor)) not in failed_links:
                available[router].add(neighbor)

    components = []
    unseen = set(routers)

    while unseen:
        start = unseen.pop()
        component = {start}
        queue = deque([start])

        while queue:
            current = queue.popleft()

            for neighbor in available[current]:
                if neighbor in unseen:
                    unseen.remove(neighbor)
                    component.add(neighbor)
                    queue.append(neighbor)

        components.append(sorted(r.upper() for r in component))

    affected_links = []

    for incident in incidents:
        candidate = incident.get("candidate_link", "")
        left, separator, right = candidate.lower().partition("-")

        if not separator or left not in routers or right not in routers:
            continue

        # Check whether another path connects the endpoints
        queue = deque([left])
        visited = {left}

        while queue:
            current = queue.popleft()

            for neighbor in available[current]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)

        alternate_path_exists = right in visited

        affected_links.append({
            "link": candidate,
            "subnet": incident.get("subnet"),
            "alternate_path_exists": alternate_path_exists,
            "impact": (
                "REDUNDANT_PATH_AVAILABLE"
                if alternate_path_exists
                else "NETWORK_PARTITION_RISK"
            ),
            "assessment": (
                "The topology contains an alternate path between "
                "these routers, but live routing must be verified."
                if alternate_path_exists
                else "No alternate path exists in the remaining "
                "topology between these routers."
            ),
        })

    return {
        "analysis_type": "TOPOLOGY_BASED_ESTIMATE",
        "routers_in_topology": len(routers),
        "failed_links_assumed": len(failed_links),
        "connected_components": components,
        "affected_links": affected_links,
        "limitations": (
            "This estimates connectivity from the configured topology "
            "and candidate incidents. It does not confirm live route "
            "reachability or identify lost prefixes."
        ),
    }
