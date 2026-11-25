
import unittest

from app.diagnosis.bgp_analyzer import analyze_bgp
from app.diagnosis.root_cause import correlate_findings
from app.diagnosis.measurements import analyze_interfaces, analyze_probes, summarize_syslog
from app.diagnosis.impact_analysis import analyze_impact
from app.diagnosis.engine import build_diagnosis
from app.topology import load_topology


TOPOLOGY = load_topology()


def make_healthy_snapshot():
    routers = []
    for r in TOPOLOGY["routers"]:
        rid = r["id"]
        # Interface states for all connected links
        if_lines = []
        bgp_lines = [
            "IPv4 Unicast Summary:",
            "Neighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd PfxSnt Desc",
        ]
        for link in TOPOLOGY["links"]:
            if link["a"] == rid:
                if_lines.append(f"{link['a_endpoint']['interface']} UP 10.0.0.0/30")
                peer_as = 65000 + int(link["b"][1:])
                bgp_lines.append(f"{link['b_endpoint']['address']} 4 {peer_as} 50 50 1 0 0 01:00:00 3 5 N/A")
            elif link["b"] == rid:
                if_lines.append(f"{link['b_endpoint']['interface']} UP 10.0.0.0/30")
                peer_as = 65000 + int(link["a"][1:])
                bgp_lines.append(f"{link['a_endpoint']['address']} 4 {peer_as} 50 50 1 0 0 01:00:00 3 5 N/A")
        bgp_lines.append(f"Total number of neighbors {len(bgp_lines) - 2}")

        routers.append({
            "router": rid,
            "healthy_collection": True,
            "interface_state": {"success": True, "output": "\n".join(if_lines)},
            "interfaces": {"success": True, "output": "\n".join(if_lines)},
            "bgp": {"success": True, "output": "\n".join(bgp_lines)},
            "syslog": {"success": True, "output": ""},
        })

    measurements = []
    for link in TOPOLOGY["links"]:
        measurements.append({
            "link": link["id"],
            "observations": [
                {
                    "router": link["a"],
                    "target": link["b"],
                    "target_address": link["b_endpoint"]["address"],
                    "available": True,
                    "packets_sent": 10,
                    "packets_received": 10,
                    "packet_loss_percent": 0.0,
                    "rtt_avg_ms": 2.5,
                },
                {
                    "router": link["b"],
                    "target": link["a"],
                    "target_address": link["a_endpoint"]["address"],
                    "available": True,
                    "packets_sent": 10,
                    "packets_received": 10,
                    "packet_loss_percent": 0.0,
                    "rtt_avg_ms": 2.6,
                },
            ],
        })

    return {
        "collected_at": "2026-11-24T00:00:00Z",
        "topology": TOPOLOGY,
        "routers": routers,
        "measurements": measurements,
        "syslog_events": [],
    }


class DiagnosisTests(unittest.TestCase):

    def test_active_neighbor_is_detected_and_correlated(self):
        router_data = {
            "router": "r1",
            "bgp": {
                "success": True,
                "output": """IPv4 Unicast Summary:
Neighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd PfxSnt Desc
10.0.12.2 4 65002 53 53 5 0 0 00:45:05 3 5 N/A
10.0.13.2 4 65003 0 0 0 0 0 never Active 0 N/A
Total number of neighbors 2"""
            },
        }

        findings = analyze_bgp(router_data)

        self.assertTrue(any(
            f["type"] == "BGP_SESSION_NOT_ESTABLISHED"
            and f["neighbor"] == "10.0.13.2"
            for f in findings
        ))

        correlated = correlate_findings(findings)

        self.assertTrue(any(
            f["candidate_link"] == "R1-R3"
            and f["subnet"] == "10.0.13.0/30"
            for f in correlated
        ))

    def test_healthy_neighbor_produces_no_findings(self):
        router_data = {
            "router": "r1",
            "bgp": {
                "success": True,
                "output": """IPv4 Unicast Summary:
Neighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd PfxSnt Desc
10.0.12.2 4 65002 53 53 5 0 0 00:45:05 3 5 N/A
10.0.13.2 4 65003 52 52 5 0 0 00:44:57 3 5 N/A
Total number of neighbors 2"""
            },
        }

        self.assertEqual(analyze_bgp(router_data), [])

    def test_healthy_network_yields_insufficient_evidence_and_unsupported_conclusion(self):
        snapshot = make_healthy_snapshot()
        diagnosis = build_diagnosis(snapshot)

        self.assertEqual(diagnosis["findings"], [])
        self.assertEqual(diagnosis["candidate_root_causes"], [])
        self.assertEqual(diagnosis["diagnosis_status"], "insufficient_evidence")
        self.assertIsNotNone(diagnosis["unsupported_conclusion"])
        self.assertIn("does not support a specific fault conclusion", diagnosis["unsupported_conclusion"])
        self.assertEqual(diagnosis["coverage"]["routers_collected"], 5)
        self.assertEqual(diagnosis["coverage"]["links_measured"], 5)

    def test_seeded_scenario_link_r2_r4_down(self):
        snapshot = make_healthy_snapshot()
        # R2 eth2 down, 100% loss on R2-R4, BGP sessions down
        for router in snapshot["routers"]:
            if router["router"] == "r2":
                router["interface_state"]["output"] = "eth1 UP 10.0.12.2/30\neth2 DOWN 10.0.24.1/30"
                router["bgp"]["output"] = (
                    "IPv4 Unicast Summary:\n"
                    "Neighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd PfxSnt Desc\n"
                    "10.0.12.1 4 65001 50 50 1 0 0 01:00:00 3 5 N/A\n"
                    "10.0.24.2 4 65004 0 0 0 0 0 never Active 0 N/A\n"
                )
            elif router["router"] == "r4":
                router["bgp"]["output"] = (
                    "IPv4 Unicast Summary:\n"
                    "Neighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd PfxSnt Desc\n"
                    "10.0.24.1 4 65002 0 0 0 0 0 never Connect 0 N/A\n"
                    "10.0.34.1 4 65003 50 50 1 0 0 01:00:00 3 5 N/A\n"
                    "10.0.45.2 4 65005 50 50 1 0 0 01:00:00 3 5 N/A\n"
                )

        for m in snapshot["measurements"]:
            if m["link"] == "R2-R4":
                m["observations"] = [
                    {"router": "r2", "target": "r4", "target_address": "10.0.24.2", "available": True, "packets_sent": 10, "packets_received": 0, "packet_loss_percent": 100.0, "rtt_avg_ms": None},
                    {"router": "r4", "target": "r2", "target_address": "10.0.24.1", "available": True, "packets_sent": 10, "packets_received": 0, "packet_loss_percent": 100.0, "rtt_avg_ms": None},
                ]

        diagnosis = build_diagnosis(snapshot)
        self.assertEqual(diagnosis["diagnosis_status"], "ranked_hypotheses")
        self.assertIsNone(diagnosis["unsupported_conclusion"])
        candidates = diagnosis["candidate_root_causes"]
        self.assertTrue(len(candidates) >= 1)
        top = candidates[0]
        self.assertEqual(top["candidate_link"], "R2-R4")
        self.assertEqual(top["rank"], 1)
        self.assertEqual(top["confidence_label"], "high")
        self.assertGreaterEqual(top["score"], 8)
        self.assertIn("R2", top["affected_routers"])

    def test_seeded_scenario_bgp_r1_r2_shutdown(self):
        snapshot = make_healthy_snapshot()
        # Interfaces UP, pings healthy, but BGP peer shut
        for router in snapshot["routers"]:
            if router["router"] == "r1":
                router["bgp"]["output"] = (
                    "IPv4 Unicast Summary:\n"
                    "Neighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd PfxSnt Desc\n"
                    "10.0.12.2 4 65002 0 0 0 0 0 never Idle 0 N/A\n"
                    "10.0.13.2 4 65003 50 50 1 0 0 01:00:00 3 5 N/A\n"
                )
            elif router["router"] == "r2":
                router["bgp"]["output"] = (
                    "IPv4 Unicast Summary:\n"
                    "Neighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd PfxSnt Desc\n"
                    "10.0.12.1 4 65001 0 0 0 0 0 never Active 0 N/A\n"
                    "10.0.24.2 4 65004 50 50 1 0 0 01:00:00 3 5 N/A\n"
                )

        diagnosis = build_diagnosis(snapshot)
        self.assertEqual(diagnosis["diagnosis_status"], "ranked_hypotheses")
        candidates = diagnosis["candidate_root_causes"]
        self.assertEqual(candidates[0]["candidate_link"], "R1-R2")
        self.assertEqual(candidates[0]["rank"], 1)
        # BGP sessions down from both sides give score 3 + 3 = 6 (medium confidence)
        self.assertGreaterEqual(candidates[0]["score"], 6)

    def test_seeded_scenario_route_r5_withdrawal(self):
        snapshot = make_healthy_snapshot()
        # Interface and ping healthy, sessions established, but R4 receives 0 prefixes from R5
        for router in snapshot["routers"]:
            if router["router"] == "r4":
                router["bgp"]["output"] = (
                    "IPv4 Unicast Summary:\n"
                    "Neighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd PfxSnt Desc\n"
                    "10.0.24.1 4 65002 50 50 1 0 0 01:00:00 3 5 N/A\n"
                    "10.0.34.1 4 65003 50 50 1 0 0 01:00:00 3 5 N/A\n"
                    "10.0.45.2 4 65005 50 50 1 0 0 01:00:00 0 5 N/A\n"
                )

        diagnosis = build_diagnosis(snapshot)
        self.assertEqual(diagnosis["diagnosis_status"], "ranked_hypotheses")
        candidates = diagnosis["candidate_root_causes"]
        self.assertEqual(candidates[0]["candidate_link"], "R4-R5")
        self.assertEqual(candidates[0]["rank"], 1)
        self.assertTrue(any(f["type"] == "NO_PREFIXES_RECEIVED" for f in diagnosis["findings"]))

    def test_seeded_scenario_degraded_r2_r4_delay_and_loss(self):
        snapshot = make_healthy_snapshot()
        # Interface UP, BGP established, but active probes report 20% loss and 200ms RTT
        for m in snapshot["measurements"]:
            if m["link"] == "R2-R4":
                m["observations"] = [
                    {"router": "r2", "target": "r4", "target_address": "10.0.24.2", "available": True, "packets_sent": 10, "packets_received": 8, "packet_loss_percent": 20.0, "rtt_avg_ms": 201.4},
                    {"router": "r4", "target": "r2", "target_address": "10.0.24.1", "available": True, "packets_sent": 10, "packets_received": 8, "packet_loss_percent": 20.0, "rtt_avg_ms": 198.8},
                ]

        diagnosis = build_diagnosis(snapshot)
        self.assertEqual(diagnosis["diagnosis_status"], "ranked_hypotheses")
        candidates = diagnosis["candidate_root_causes"]
        self.assertEqual(candidates[0]["candidate_link"], "R2-R4")
        self.assertEqual(candidates[0]["rank"], 1)

        # Both packet loss AND high latency should be recorded as findings
        finding_types = {f["type"] for f in diagnosis["findings"] if f["link"] == "R2-R4"}
        self.assertIn("ACTIVE_PROBE_PACKET_LOSS", finding_types)
        self.assertIn("ACTIVE_PROBE_HIGH_LATENCY", finding_types)

    def test_seeded_scenario_link_r3_r4_down(self):
        snapshot = make_healthy_snapshot()
        for router in snapshot["routers"]:
            if router["router"] == "r3":
                router["interface_state"]["output"] = "eth1 UP 10.0.13.2/30\neth2 DOWN 10.0.34.1/30"
                router["bgp"]["output"] = (
                    "IPv4 Unicast Summary:\n"
                    "Neighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd PfxSnt Desc\n"
                    "10.0.13.1 4 65001 50 50 1 0 0 01:00:00 3 5 N/A\n"
                    "10.0.34.2 4 65004 0 0 0 0 0 never Active 0 N/A\n"
                )
            elif router["router"] == "r4":
                router["bgp"]["output"] = (
                    "IPv4 Unicast Summary:\n"
                    "Neighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd PfxSnt Desc\n"
                    "10.0.24.1 4 65002 50 50 1 0 0 01:00:00 3 5 N/A\n"
                    "10.0.34.1 4 65003 0 0 0 0 0 never Connect 0 N/A\n"
                    "10.0.45.2 4 65005 50 50 1 0 0 01:00:00 3 5 N/A\n"
                )

        for m in snapshot["measurements"]:
            if m["link"] == "R3-R4":
                m["observations"] = [
                    {"router": "r3", "target": "r4", "target_address": "10.0.34.2", "available": True, "packets_sent": 10, "packets_received": 0, "packet_loss_percent": 100.0, "rtt_avg_ms": None},
                    {"router": "r4", "target": "r3", "target_address": "10.0.34.1", "available": True, "packets_sent": 10, "packets_received": 0, "packet_loss_percent": 100.0, "rtt_avg_ms": None},
                ]

        diagnosis = build_diagnosis(snapshot)
        self.assertEqual(diagnosis["diagnosis_status"], "ranked_hypotheses")
        candidates = diagnosis["candidate_root_causes"]
        self.assertEqual(candidates[0]["candidate_link"], "R3-R4")
        self.assertEqual(candidates[0]["rank"], 1)

    def test_active_probe_unavailable_is_treated_as_missing_evidence_zero_score(self):
        measurements = [{
            "link": "R1-R2",
            "observations": [
                {"router": "r1", "target": "r2", "target_address": "10.0.12.2", "available": False, "packet_loss_percent": None, "rtt_avg_ms": None},
            ],
        }]
        findings = analyze_probes(measurements)
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["type"], "ACTIVE_PROBE_UNAVAILABLE")
        self.assertIn("missing evidence, not proof of failure", findings[0]["message"])

        correlated = correlate_findings(findings)
        # Score for unavailable probe is 0, so it should not create candidate root causes
        self.assertEqual(correlated, [])

    def test_syslog_correlation_and_recovery_filtering(self):
        routers = [
            {
                "router": "r1",
                "syslog": {
                    "success": True,
                    "output": "2026-11-24T00:00:01Z %BGP-5-ADJCHANGE: neighbor 10.0.12.2 Down BGP notification received\n"
                              "2026-11-24T00:00:02Z %BGP-5-ADJCHANGE: neighbor 10.0.13.2 Up Established\n",
                },
            },
            {
                "router": "r2",
                "syslog": {
                    "success": True,
                    "output": "2026-11-24T00:00:01Z eth2 link down\n",
                },
            },
        ]
        events = summarize_syslog(routers)
        # Established is recovery context and should be ignored
        self.assertFalse(any(e.get("state") == "ESTABLISHED" for e in events))
        # BGP Down on 10.0.12.2 and eth2 link down on r2 should be parsed
        self.assertTrue(any(e["event_type"] == "BGP_NEIGHBOR_STATE" and e["peer"] == "10.0.12.2" for e in events))
        self.assertTrue(any(e["event_type"] == "INTERFACE_STATE" and e["interface"] == "eth2" for e in events))

        # Correlating with syslog boosts score
        correlated = correlate_findings([], syslog_events=events)
        links = {c["candidate_link"] for c in correlated}
        self.assertIn("R1-R2", links)
        self.assertIn("R2-R4", links)

    def test_impact_analysis_redundant_path_vs_partition_risk(self):
        # Scenario A: R2-R4 candidate link failure (score 10)
        # R2 and R4 still have alternate path R2-R1-R3-R4
        incidents_redundant = [{"candidate_link": "R2-R4", "score": 10, "subnet": "10.0.24.0/30"}]
        impact = analyze_impact(incidents_redundant, TOPOLOGY)
        self.assertEqual(len(impact["affected_links"]), 1)
        affected = impact["affected_links"][0]
        self.assertTrue(affected["alternate_path_exists"])
        self.assertEqual(affected["impact"], "REDUNDANT_PATH_AVAILABLE")

        # Scenario B: R4-R5 candidate link failure (score 10)
        # R5 has no alternate path (stub/edge router attached only to R4)
        incidents_partition = [{"candidate_link": "R4-R5", "score": 10, "subnet": "10.0.45.0/30"}]
        impact_part = analyze_impact(incidents_partition, TOPOLOGY)
        self.assertEqual(len(impact_part["affected_links"]), 1)
        affected_part = impact_part["affected_links"][0]
        self.assertFalse(affected_part["alternate_path_exists"])
        self.assertEqual(affected_part["impact"], "NETWORK_PARTITION_RISK")

    def test_missing_telemetry_triggers_insufficient_telemetry_abstention(self):
        snapshot = make_healthy_snapshot()
        # Simulate r3 collection failure
        for r in snapshot["routers"]:
            if r["router"] == "r3":
                r["healthy_collection"] = False
                r["interface_state"] = {"success": False, "error": "SSH connection timeout"}
                r["bgp"] = {"success": False, "error": "SSH connection timeout"}

        diagnosis = build_diagnosis(snapshot)
        self.assertEqual(diagnosis["outcome"], "INSUFFICIENT_TELEMETRY")
        self.assertEqual(diagnosis["diagnosis_status"], "insufficient_evidence")
        self.assertIn("Incomplete telemetry collection", diagnosis["abstention_reason"])
        self.assertTrue(diagnosis["data_quality"]["incomplete_collection"])
        self.assertIn("R3", diagnosis["data_quality"]["failed_routers"])

    def test_missing_syslog_does_not_break_diagnosis(self):
        snapshot = make_healthy_snapshot()
        # Seed link_r2_r4_down fault, but clear all syslog
        for router in snapshot["routers"]:
            router["syslog"] = {"success": True, "output": ""}
            if router["router"] == "r2":
                router["interface_state"]["output"] = "eth1 UP 10.0.12.2/30\neth2 DOWN 10.0.24.1/30"
                router["bgp"]["output"] = (
                    "IPv4 Unicast Summary:\n"
                    "Neighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd PfxSnt Desc\n"
                    "10.0.12.1 4 65001 50 50 1 0 0 01:00:00 3 5 N/A\n"
                    "10.0.24.2 4 65004 0 0 0 0 0 never Active 0 N/A\n"
                )
            elif router["router"] == "r4":
                router["bgp"]["output"] = (
                    "IPv4 Unicast Summary:\n"
                    "Neighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd PfxSnt Desc\n"
                    "10.0.24.1 4 65002 0 0 0 0 0 never Connect 0 N/A\n"
                    "10.0.34.1 4 65003 50 50 1 0 0 01:00:00 3 5 N/A\n"
                    "10.0.45.2 4 65005 50 50 1 0 0 01:00:00 3 5 N/A\n"
                )
        for m in snapshot["measurements"]:
            if m["link"] == "R2-R4":
                m["observations"] = [
                    {"router": "r2", "target": "r4", "target_address": "10.0.24.2", "available": True, "packets_sent": 10, "packets_received": 0, "packet_loss_percent": 100.0, "rtt_avg_ms": None},
                    {"router": "r4", "target": "r2", "target_address": "10.0.24.1", "available": True, "packets_sent": 10, "packets_received": 0, "packet_loss_percent": 100.0, "rtt_avg_ms": None},
                ]
        snapshot["syslog_events"] = []

        diagnosis = build_diagnosis(snapshot)
        self.assertEqual(diagnosis["outcome"], "DIAGNOSIS")
        self.assertEqual(diagnosis["diagnosis_status"], "ranked_hypotheses")
        self.assertEqual(diagnosis["candidate_root_causes"][0]["candidate_link"], "R2-R4")
        self.assertEqual(diagnosis["candidate_root_causes"][0]["rank"], 1)

    def test_stale_and_invalid_timestamps(self):
        from datetime import datetime, timezone, timedelta
        snapshot = make_healthy_snapshot()
        # Stale timestamp: 10 minutes ago
        stale_time = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
        snapshot["collected_at"] = stale_time

        diagnosis = build_diagnosis(snapshot)
        self.assertTrue(diagnosis["data_quality"]["timestamp_valid"])
        self.assertTrue(diagnosis["data_quality"]["is_stale"])
        self.assertGreater(diagnosis["data_quality"]["age_seconds"], 300)

        # Invalid timestamp
        snapshot["collected_at"] = "invalid-timestamp"
        diag_invalid = build_diagnosis(snapshot)
        self.assertFalse(diag_invalid["data_quality"]["timestamp_valid"])

    def test_duplicate_events_deduplicated_without_inflating_score(self):
        findings = [
            {
                "observation_id": "probe_loss_1",
                "type": "ACTIVE_PROBE_PACKET_LOSS",
                "link": "R1-R2",
                "router": "r1",
                "packet_loss_percent": 20.0,
                "message": "Probe loss 20%",
                "source_type": "active_probe",
            },
            # Duplicate with same observation_id
            {
                "observation_id": "probe_loss_1",
                "type": "ACTIVE_PROBE_PACKET_LOSS",
                "link": "R1-R2",
                "router": "r1",
                "packet_loss_percent": 20.0,
                "message": "Probe loss 20%",
                "source_type": "active_probe",
            },
        ]
        syslog = [
            {
                "router": "r1",
                "event_type": "BGP_NEIGHBOR_STATE",
                "peer": "10.0.12.2",
                "interface": None,
                "state": "DOWN",
                "message": "BGP Down on R1-R2",
            },
            # Duplicate syslog entry
            {
                "router": "r1",
                "event_type": "BGP_NEIGHBOR_STATE",
                "peer": "10.0.12.2",
                "interface": None,
                "state": "DOWN",
                "message": "BGP Down on R1-R2",
            },
        ]

        correlated = correlate_findings(findings, syslog_events=syslog)
        r1_r2 = next(c for c in correlated if c["candidate_link"] == "R1-R2")
        # 1 unique probe loss (2 pts) + 1 unique syslog (2 pts) = 4 pts total
        self.assertEqual(r1_r2["score"], 4)
        # Duplicate events captured
        self.assertEqual(len(r1_r2["duplicate_events"]), 2)

    def test_contradictory_signals_recorded_for_bgp_shutdown(self):
        snapshot = make_healthy_snapshot()
        for router in snapshot["routers"]:
            if router["router"] == "r1":
                router["bgp"]["output"] = (
                    "IPv4 Unicast Summary:\n"
                    "Neighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd PfxSnt Desc\n"
                    "10.0.12.2 4 65002 0 0 0 0 0 never Idle 0 N/A\n"
                    "10.0.13.2 4 65003 50 50 1 0 0 01:00:00 3 5 N/A\n"
                )
            elif router["router"] == "r2":
                router["bgp"]["output"] = (
                    "IPv4 Unicast Summary:\n"
                    "Neighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd PfxSnt Desc\n"
                    "10.0.12.1 4 65001 0 0 0 0 0 never Active 0 N/A\n"
                    "10.0.24.2 4 65004 50 50 1 0 0 01:00:00 3 5 N/A\n"
                )

        diagnosis = build_diagnosis(snapshot)
        top = diagnosis["candidate_root_causes"][0]
        self.assertEqual(top["candidate_link"], "R1-R2")
        self.assertEqual(top["fault_type"], "BGP_SESSION_FAILURE")
        # Contradictory evidence must identify interface UP and probe 0% loss
        contradicting = top["contradicting_evidence"]
        self.assertTrue(any("interface state UP" in c["observation"] for c in contradicting))
        self.assertTrue(any("0% packet loss" in c["observation"] for c in contradicting))

    def test_ambiguous_hypotheses_outcome(self):
        snapshot = make_healthy_snapshot()
        # Inject equal strength findings on disjoint links: R1-R2 (score 4) and R3-R4 (score 4)
        # using interface down without probe/BGP reinforcement
        for router in snapshot["routers"]:
            if router["router"] == "r1":
                router["interface_state"]["output"] = "eth1 DOWN 10.0.12.1/30\neth2 UP 10.0.13.1/30"
            elif router["router"] == "r3":
                router["interface_state"]["output"] = "eth1 UP 10.0.13.2/30\neth2 DOWN 10.0.34.1/30"

        diagnosis = build_diagnosis(snapshot)
        self.assertEqual(diagnosis["outcome"], "AMBIGUOUS_HYPOTHESES")
        self.assertEqual(diagnosis["diagnosis_status"], "insufficient_evidence")
        self.assertIn("competing candidate hypotheses", diagnosis["abstention_reason"])
        # Both candidates are preserved
        candidate_links = [c["candidate_link"] for c in diagnosis["candidate_root_causes"]]
        self.assertIn("R1-R2", candidate_links)
        self.assertIn("R3-R4", candidate_links)

    def test_graph_impact_confirmed_failure_with_alternate_path(self):
        snapshot = make_healthy_snapshot()
        # Seed link_r2_r4_down: R2 eth2 DOWN, 100% loss
        for r in snapshot["routers"]:
            if r["router"] == "r2":
                r["interface_state"]["output"] = "eth1 UP 10.0.12.2/30\neth2 DOWN 10.0.24.1/30"
        for m in snapshot["measurements"]:
            if m["link"] == "R2-R4":
                m["observations"] = [
                    {"router": "r2", "target": "r4", "target_address": "10.0.24.2", "available": True, "packets_sent": 10, "packets_received": 0, "packet_loss_percent": 100.0, "rtt_avg_ms": None},
                    {"router": "r4", "target": "r2", "target_address": "10.0.24.1", "available": True, "packets_sent": 10, "packets_received": 0, "packet_loss_percent": 100.0, "rtt_avg_ms": None},
                ]

        diagnosis = build_diagnosis(snapshot)
        impact = diagnosis["impact_analysis"]

        self.assertEqual(impact["confirmed_failed_links"], ["R2-R4"])
        self.assertEqual(impact["link_conditions"]["R2-R4"], "CONFIRMED_DOWN")
        self.assertFalse(impact["actual_partition"])
        self.assertFalse(impact["network_partitioned"])
        self.assertTrue(impact["current_connectivity"]["is_connected"])
        self.assertEqual(impact["connected_components"], [["R1", "R2", "R3", "R4", "R5"]])
        # Redundant path exists for R2-R4
        self.assertEqual(impact["redundant_paths"]["R2-R4"], ["R2", "R1", "R3", "R4"])
        r2_r4_affected = next(item for item in impact["affected_links"] if item["link"] == "R2-R4")
        self.assertTrue(r2_r4_affected["alternate_path_exists"])
        self.assertEqual(r2_r4_affected["impact"], "REDUNDANT_PATH_AVAILABLE")
        self.assertEqual(r2_r4_affected["condition"], "CONFIRMED_DOWN")
        self.assertFalse(impact["conditional_partition_risk"])

    def test_graph_impact_confirmed_failure_without_alternate_path(self):
        snapshot = make_healthy_snapshot()
        # Seed R4-R5 physical failure
        for r in snapshot["routers"]:
            if r["router"] == "r4":
                r["interface_state"]["output"] = "eth1 UP 10.0.24.2/30\neth2 UP 10.0.34.2/30\neth3 DOWN 10.0.45.1/30"
        for m in snapshot["measurements"]:
            if m["link"] == "R4-R5":
                m["observations"] = [
                    {"router": "r4", "target": "r5", "target_address": "10.0.45.2", "available": True, "packets_sent": 10, "packets_received": 0, "packet_loss_percent": 100.0, "rtt_avg_ms": None},
                    {"router": "r5", "target": "r4", "target_address": "10.0.45.1", "available": True, "packets_sent": 10, "packets_received": 0, "packet_loss_percent": 100.0, "rtt_avg_ms": None},
                ]

        diagnosis = build_diagnosis(snapshot)
        impact = diagnosis["impact_analysis"]

        self.assertEqual(impact["confirmed_failed_links"], ["R4-R5"])
        self.assertEqual(impact["link_conditions"]["R4-R5"], "CONFIRMED_DOWN")
        self.assertTrue(impact["actual_partition"])
        self.assertTrue(impact["network_partitioned"])
        self.assertFalse(impact["current_connectivity"]["is_connected"])
        self.assertEqual(impact["current_connectivity"]["isolated_routers"], ["R5"])
        self.assertEqual(impact["connected_components"], [["R1", "R2", "R3", "R4"], ["R5"]])
        self.assertIsNone(impact["redundant_paths"]["R4-R5"])
        r4_r5_affected = next(item for item in impact["affected_links"] if item["link"] == "R4-R5")
        self.assertFalse(r4_r5_affected["alternate_path_exists"])
        self.assertEqual(r4_r5_affected["impact"], "NETWORK_PARTITION_RISK")
        self.assertTrue(impact["conditional_partition_risk"])

    def test_graph_impact_bgp_failure_with_ip_connectivity(self):
        snapshot = make_healthy_snapshot()
        # BGP session down between R1 and R2, but interface UP and probes 0% loss
        for r in snapshot["routers"]:
            if r["router"] == "r1":
                r["bgp"]["output"] = (
                    "IPv4 Unicast Summary:\n"
                    "Neighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd PfxSnt Desc\n"
                    "10.0.12.2 4 65002 0 0 0 0 0 never Idle 0 N/A\n"
                    "10.0.13.2 4 65003 50 50 1 0 0 01:00:00 3 5 N/A\n"
                )

        diagnosis = build_diagnosis(snapshot)
        impact = diagnosis["impact_analysis"]

        # Link is NOT confirmed down because IP connectivity is intact
        self.assertEqual(impact["confirmed_failed_links"], [])
        self.assertEqual(impact["probable_failed_links"], [])
        self.assertEqual(impact["link_conditions"]["R1-R2"], "UP")
        # Physical edge must NOT be removed
        self.assertFalse(impact["actual_partition"])
        self.assertTrue(impact["current_connectivity"]["is_connected"])
        self.assertEqual(impact["connected_components"], [["R1", "R2", "R3", "R4", "R5"]])

    def test_graph_impact_partial_packet_loss_does_not_remove_edge(self):
        snapshot = make_healthy_snapshot()
        # Seed 20% loss and 200ms latency on R2-R4
        for m in snapshot["measurements"]:
            if m["link"] == "R2-R4":
                m["observations"] = [
                    {"router": "r2", "target": "r4", "target_address": "10.0.24.2", "available": True, "packets_sent": 10, "packets_received": 8, "packet_loss_percent": 20.0, "rtt_avg_ms": 200.0},
                    {"router": "r4", "target": "r2", "target_address": "10.0.24.1", "available": True, "packets_sent": 10, "packets_received": 8, "packet_loss_percent": 20.0, "rtt_avg_ms": 202.0},
                ]

        diagnosis = build_diagnosis(snapshot)
        impact = diagnosis["impact_analysis"]

        self.assertEqual(impact["confirmed_failed_links"], [])
        self.assertEqual(impact["degraded_links"], ["R2-R4"])
        self.assertEqual(impact["link_conditions"]["R2-R4"], "DEGRADED")
        # Edge must NOT be removed from physical graph
        self.assertFalse(impact["actual_partition"])
        self.assertTrue(impact["current_connectivity"]["is_connected"])
        self.assertEqual(impact["connected_components"], [["R1", "R2", "R3", "R4", "R5"]])

    def test_graph_impact_missing_telemetry_does_not_remove_edge(self):
        snapshot = make_healthy_snapshot()
        # Telemetry missing on R3-R4: probe unavailable
        for m in snapshot["measurements"]:
            if m["link"] == "R3-R4":
                m["observations"] = [
                    {"router": "r3", "target": "r4", "target_address": "10.0.34.2", "available": False, "packet_loss_percent": None, "rtt_avg_ms": None},
                ]

        diagnosis = build_diagnosis(snapshot)
        impact = diagnosis["impact_analysis"]

        self.assertEqual(impact["confirmed_failed_links"], [])
        self.assertEqual(impact["link_conditions"]["R3-R4"], "UNKNOWN")
        # Edge must NOT be removed from physical graph simply because telemetry is missing
        self.assertFalse(impact["actual_partition"])
        self.assertTrue(impact["current_connectivity"]["is_connected"])
        self.assertEqual(impact["connected_components"], [["R1", "R2", "R3", "R4", "R5"]])

    def test_graph_impact_multiple_failures_causes_actual_partition(self):
        # Both R1-R2 and R2-R4 are confirmed down -> R2 is completely severed
        incidents = [
            {"candidate_link": "R1-R2", "condition": "CONFIRMED_DOWN", "subnet": "10.0.12.0/30"},
            {"candidate_link": "R2-R4", "condition": "CONFIRMED_DOWN", "subnet": "10.0.24.0/30"},
        ]
        impact = analyze_impact(incidents, TOPOLOGY)

        self.assertEqual(sorted(impact["confirmed_failed_links"]), ["R1-R2", "R2-R4"])
        self.assertTrue(impact["actual_partition"])
        self.assertTrue(impact["network_partitioned"])
        self.assertFalse(impact["current_connectivity"]["is_connected"])
        self.assertEqual(impact["current_connectivity"]["isolated_routers"], ["R2"])
        self.assertEqual(impact["connected_components"], [["R1", "R3", "R4", "R5"], ["R2"]])

    def test_graph_impact_healthy_topology(self):
        snapshot = make_healthy_snapshot()
        diagnosis = build_diagnosis(snapshot)
        impact = diagnosis["impact_analysis"]

        self.assertEqual(impact["confirmed_failed_links"], [])
        self.assertEqual(impact["probable_failed_links"], [])
        self.assertEqual(impact["degraded_links"], [])
        self.assertFalse(impact["actual_partition"])
        self.assertFalse(impact["conditional_partition_risk"])
        self.assertTrue(impact["current_connectivity"]["is_connected"])
        self.assertEqual(impact["connected_components"], [["R1", "R2", "R3", "R4", "R5"]])
        self.assertEqual(impact["affected_links"], [])


if __name__ == "__main__":
    unittest.main()
