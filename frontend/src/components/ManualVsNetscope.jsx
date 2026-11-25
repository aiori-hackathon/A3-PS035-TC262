import { useState } from "react";
import {
  Terminal,
  Zap,
} from "lucide-react";

export default function ManualVsNetscope({ scenarioId = "link_failure", data = null }) {
  const [activeTab, setActiveTab] = useState("bgp");

  // Telemetry snippets based on scenario
  const cliData = {
    link_failure: {
      bgp: `clab-ps035-r2# vtysh -c "show ip bgp summary"

IPv4 Unicast Summary:
Neighbor        V    AS   MsgRcvd MsgSent   TblVer  InQ OutQ  Up/Down State/PfxRcd   PfxSnt
10.0.12.1       4 65001        58      59        0    0    0 00:52:14            3        5
10.0.24.2       4 65004         0       0        0    0    0    never       Active        0

Total number of neighbors 2`,
      interface: `clab-ps035-r2# ip -br link show
lo               UNKNOWN        00:00:00:00:00:00 <LOOPBACK,UP,LOWER_UP> 
eth1             UP             aa:c1:ab:01:02:01 <BROADCAST,MULTICAST,UP,LOWER_UP> 
eth2             DOWN           aa:c1:ab:02:04:01 <NO-CARRIER,BROADCAST,MULTICAST,UP> `,
      probe: `clab-ps035-r2# ping -c 10 -W 1 10.0.24.2
PING 10.0.24.2 (10.0.24.2) 56(84) bytes of data.

--- 10.0.24.2 ping statistics ---
10 packets transmitted, 0 received, 100% packet loss, time 9214ms`,
      syslog: `clab-ps035-r2# vtysh -c "show log"
2026/10/24 10:00:01 Z %LINK-3-UPDOWN: Interface eth2, changed state to down
2026/10/24 10:00:05 Z %BGP-5-ADJCHANGE: neighbor 10.0.24.2 Down BGP notification received`,
      diagnosis: {
        faultType: "LINK_FAILURE",
        topHypothesis: "R2-R4",
        score: "10 / 100 (High Confidence)",
        reasons: [
          "INTERFACE_NOT_UP (+4 pts) - r2 eth2 observed DOWN",
          "ACTIVE_PROBE_PACKET_LOSS (+4 pts) - 100% ICMP loss across R2-R4",
          "SYSLOG_LINK_DOWN (+2 pts) - Interface eth2 state changed to down",
        ],
        contradictory: "None (both data plane and physical layer confirm severance)",
        impact: "REDUNDANT_PATH_AVAILABLE via R2 -> R1 -> R3 -> R4 (No network partition)",
        time: "< 95 ms",
      },
    },
    bgp_failure: {
      bgp: `clab-ps035-r1# vtysh -c "show ip bgp summary"

IPv4 Unicast Summary:
Neighbor        V    AS   MsgRcvd MsgSent   TblVer  InQ OutQ  Up/Down State/PfxRcd   PfxSnt
10.0.12.2       4 65002         0       0        0    0    0    never         Idle        0
10.0.13.2       4 65003        60      60        0    0    0 00:54:12            3        5

Total number of neighbors 2`,
      interface: `clab-ps035-r1# ip -br link show
lo               UNKNOWN        00:00:00:00:00:00 <LOOPBACK,UP,LOWER_UP> 
eth1             UP             aa:c1:ab:01:02:01 <BROADCAST,MULTICAST,UP,LOWER_UP> 
eth2             UP             aa:c1:ab:01:03:01 <BROADCAST,MULTICAST,UP,LOWER_UP> `,
      probe: `clab-ps035-r1# ping -c 10 -W 1 10.0.12.2
PING 10.0.12.2 (10.0.12.2) 56(84) bytes of data.
64 bytes from 10.0.12.2: icmp_seq=1 ttl=64 time=1.82 ms
64 bytes from 10.0.12.2: icmp_seq=2 ttl=64 time=1.91 ms
...
--- 10.0.12.2 ping statistics ---
10 packets transmitted, 10 received, 0% packet loss, time 9012ms
rtt min/avg/max/mdev = 1.642/1.854/2.112/0.142 ms`,
      syslog: `clab-ps035-r1# vtysh -c "show log"
2026/10/24 10:00:02 Z %BGP-5-ADJCHANGE: neighbor 10.0.12.2 Down User shutdown`,
      diagnosis: {
        faultType: "BGP_SESSION_FAILURE",
        topHypothesis: "R1-R2",
        score: "6 / 100 (Medium Confidence)",
        reasons: [
          "BGP_SESSION_NOT_ESTABLISHED (+3 pts) - Peer 10.0.12.2 is in Idle state",
          "SYSLOG_BGP_DOWN (+2 pts) - neighbor 10.0.12.2 Down",
        ],
        contradictory: "Interface eth1 is UP and active ICMP probe reports 0% loss (proves physical layer is intact)",
        impact: "Control plane isolated; physical forwarding intact (No physical partition)",
        time: "< 85 ms",
      },
    },
    default: {
      bgp: `clab-ps035-r1# vtysh -c "show ip bgp summary" ... (inspecting 5 nodes)`,
      interface: `clab-ps035-r1# ip -br link show ... (inspecting 10 interfaces)`,
      probe: `clab-ps035-r1# ping -c 10 10.0.x.x ... (running bidirectional probes)`,
      syslog: `clab-ps035-r1# vtysh -c "show log" ... (searching log buffer)`,
      diagnosis: {
        faultType: "AUTOMATED_EVALUATION",
        topHypothesis: data?.diagnosis?.candidate_root_causes?.[0]?.candidate_link || "Evaluated Link",
        score: `${data?.diagnosis?.candidate_root_causes?.[0]?.score || 8} / 100`,
        reasons: ["Correlated across interface state, active ICMP probes, BGP state, and syslog events"],
        contradictory: "Cross-layer validation isolates control-plane from physical link defects",
        impact: data?.diagnosis?.impact_analysis?.affected_links?.[0]?.impact || "Analyzed via BFS",
        time: "< 100 ms",
      },
    },
  };

  const activeData = cliData[scenarioId] || cliData.link_failure || cliData.default;
  const diag = activeData.diagnosis;

  return (
    <div className="manual-vs-netscope-panel" style={{ marginTop: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: 1.5,
            color: "#a95334",
            textTransform: "uppercase",
          }}
        >
          OPERATOR PRODUCTIVITY
        </span>
        <h3 style={{ margin: "4px 0 0", fontSize: 20, fontFamily: "Space Grotesk, sans-serif" }}>
          Manual Operator Investigation vs. NETSCOPE
        </h3>
        <p style={{ margin: "4px 0 0", fontSize: 12, color: "#777167" }}>
          Compare the cognitive load of manual CLI triage against NETSCOPE's instant evidence-led synthesis.
        </p>
      </div>

      <div
        className="comparison-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 20,
        }}
      >
        {/* Left Side: Manual Operator Investigation */}
        <div
          className="panel manual-column"
          style={{
            padding: 20,
            background: "#1c201c",
            color: "#e8eadf",
            borderRadius: 16,
            border: "1px solid #333d32",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 14,
              borderBottom: "1px solid #2e382d",
              paddingBottom: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Terminal size={17} color="#f0b184" />
              <strong style={{ fontSize: 13, color: "#f5f3ec" }}>Manual Operator Triage</strong>
            </div>
            <span
              style={{
                fontSize: 10,
                padding: "3px 8px",
                borderRadius: 6,
                background: "#3d2a23",
                color: "#f29474",
                fontWeight: 700,
              }}
            >
              15–30 MIN LATENCY
            </span>
          </div>

          {/* Terminal Tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            {[
              ["bgp", "show ip bgp"],
              ["interface", "ip link show"],
              ["probe", "ping probe"],
              ["syslog", "show log"],
            ].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                style={{
                  background: activeTab === id ? "#354534" : "#242d23",
                  color: activeTab === id ? "#a5d49b" : "#899083",
                  border: "1px solid #3c4d3b",
                  borderRadius: 6,
                  padding: "4px 9px",
                  fontSize: 10,
                  fontFamily: "monospace",
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Terminal Output Window */}
          <div
            style={{
              background: "#121612",
              padding: 12,
              borderRadius: 8,
              border: "1px solid #263325",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              fontSize: 11,
              lineHeight: 1.5,
              color: "#c2d1be",
              overflowX: "auto",
              minHeight: 180,
              maxHeight: 220,
            }}
          >
            <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{activeData[activeTab] || activeData.bgp}</pre>
          </div>

          {/* Operator Friction Points */}
          <div
            style={{
              marginTop: 16,
              padding: 12,
              background: "#241c18",
              border: "1px solid #4a3429",
              borderRadius: 10,
              fontSize: 11,
              color: "#e2b8a6",
              lineHeight: 1.6,
            }}
          >
            <strong style={{ display: "block", color: "#f29474", marginBottom: 4 }}>
              Manual Investigation Friction Points:
            </strong>
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              <li>5 separate FRR containers to log into and query manually.</li>
              <li>Must manually cross-reference IP endpoints against topology subnets.</li>
              <li>Partial packet loss (e.g. 20% netem delay) is easily missed without continuous probing.</li>
              <li>Mental correlation of logs and interface states is prone to human oversight.</li>
            </ul>
          </div>
        </div>

        {/* Right Side: NETSCOPE Automated Diagnosis */}
        <div
          className="panel netscope-column"
          style={{
            padding: 20,
            background: "#fff",
            borderRadius: 16,
            border: "2px solid #578866",
            boxShadow: "0 10px 30px #57886615",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 14,
              borderBottom: "1px solid #eee8de",
              paddingBottom: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Zap size={18} color="#578866" />
              <strong style={{ fontSize: 13, color: "#30352f" }}>NETSCOPE Engine Synthesis</strong>
            </div>
            <span
              style={{
                fontSize: 10,
                padding: "3px 8px",
                borderRadius: 6,
                background: "#e8eee2",
                color: "#355941",
                fontWeight: 800,
              }}
            >
              DIAGNOSIS: {diag.time}
            </span>
          </div>

          {/* Top-Ranked Hypothesis Hero */}
          <div
            style={{
              padding: 14,
              background: "#f4f8f3",
              border: "1px solid #c9ddc7",
              borderRadius: 12,
              marginBottom: 14,
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: "#578866",
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              TOP-1 RANKED HYPOTHESIS
            </span>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginTop: 4,
              }}
            >
              <h4 style={{ margin: 0, fontSize: 18, color: "#223325", fontFamily: "Space Grotesk, sans-serif" }}>
                {diag.topHypothesis} · {diag.faultType}
              </h4>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#355941" }}>{diag.score}</span>
            </div>
          </div>

          {/* Scoring Reasons Breakdown */}
          <div style={{ marginBottom: 14 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: "#777167", textTransform: "uppercase" }}>
              DETERMINISTIC EVIDENCE CORRELATION
            </span>
            <ul style={{ margin: "6px 0 0", paddingLeft: 16, fontSize: 11, color: "#44483f", lineHeight: 1.6 }}>
              {diag.reasons.map((r, idx) => (
                <li key={idx}>
                  <strong>{r}</strong>
                </li>
              ))}
            </ul>
          </div>

          {/* Contradictory Evidence Analysis */}
          <div
            style={{
              padding: 10,
              background: "#faf7f0",
              border: "1px solid #e7e3d9",
              borderLeft: "3px solid #c18159",
              borderRadius: "0 8px 8px 0",
              fontSize: 11,
              marginBottom: 14,
            }}
          >
            <strong style={{ color: "#73503a", display: "block", fontSize: 10, textTransform: "uppercase" }}>
              Contradictory Signal Analysis:
            </strong>
            <span style={{ color: "#44483f" }}>{diag.contradictory}</span>
          </div>

          {/* Impact Analysis */}
          <div
            style={{
              padding: 10,
              background: "#fdfbf7",
              border: "1px solid #ece7dc",
              borderRadius: 8,
              fontSize: 11,
            }}
          >
            <strong style={{ color: "#578866", display: "block", fontSize: 10, textTransform: "uppercase" }}>
              Topology Impact (BFS Graph Traversal):
            </strong>
            <span style={{ color: "#30352f" }}>{diag.impact}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
