
import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from app.collector.command import run_command
from app.topology import load_topology
from app.collector.measurements import probe_link
from app.diagnosis.measurements import summarize_syslog

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"
TOPOLOGY = load_topology()
ROUTERS = TOPOLOGY["routers"]


def collect_router(router):
    name = router["id"]
    container = router["container"]
    return {
        "router": name,
        "collected_at": datetime.now(timezone.utc).isoformat(),
        "bgp": run_command(["docker", "exec", container, "vtysh", "-c", "show bgp summary"]),
        "interfaces": run_command(["docker", "exec", container, "ip", "-br", "addr"]),
        "interface_state": run_command(["docker", "exec", container, "ip", "-br", "link"]),
        "syslog": run_command(["docker", "logs", "--since", "5m", "--tail", "100", container]),
        "healthy_collection": False,
    }


def collect_snapshot():
    routers = [collect_router(router) for router in ROUTERS]
    for router in routers:
        router["healthy_collection"] = router["bgp"]["success"] and router["interfaces"]["success"]
    by_id = {item["id"]: item for item in ROUTERS}
    measurements = [probe_link(link, by_id) for link in TOPOLOGY["links"]]
    return {
        "project": TOPOLOGY["name"],
        "collected_at": datetime.now(timezone.utc).isoformat(),
        "topology": TOPOLOGY,
        "routers": routers,
        "measurements": measurements,
        "syslog_events": summarize_syslog(routers),
    }


def save_snapshot(snapshot, output_dir=None):
    directory = Path(output_dir) if output_dir else DATA_DIR
    directory.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now(timezone.utc).strftime(
        "%Y%m%dT%H%M%SZ"
    )
    output_file = directory / f"telemetry_{timestamp}.json"

    output_file.write_text(
        json.dumps(snapshot, indent=2),
        encoding="utf-8",
    )
    return output_file


def main(argv=None):
    parser = argparse.ArgumentParser(description='Collect one PS-035 lab snapshot.')
    parser.add_argument('--output-dir', default=os.environ.get('NETSCOPE_SNAPSHOT_DIR'),
                        help='Snapshot directory (default: repository data/).')
    args = parser.parse_args(argv)
    snapshot = collect_snapshot()
    output_file = save_snapshot(snapshot, args.output_dir)

    print(f"Telemetry saved to: {output_file.relative_to(PROJECT_ROOT)}")

    for router in snapshot["routers"]:
        status = (
            "OK" if router["healthy_collection"]
            else "COLLECTION ERROR"
        )
        print(f"{router['router'].upper()}: {status}")

        if not router["healthy_collection"]:
            if router["bgp"]["error"]:
                print(f"  BGP error: {router['bgp']['error']}")
            if router["interfaces"]["error"]:
                print(
                    f"  Interface error: "
                    f"{router['interfaces']['error']}"
                )


if __name__ == "__main__":
    main()
