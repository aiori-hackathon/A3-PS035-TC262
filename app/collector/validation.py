"""Framework-independent validation for locally collected telemetry."""
from app.topology import load_topology


TOPOLOGY = load_topology()


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
