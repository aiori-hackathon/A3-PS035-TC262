import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  GitBranch,
  Network,
  RefreshCw,
  Router,
  ShieldAlert,
  Database,
  Info,
  Zap,
  X,
  ChevronRight,
  Radio,
  Layers,
  Route,
  Search,
  ShieldCheck,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router";
import { useDemoScenario } from "./hooks/useDemoScenario";
import { findingCategory, investigationContext } from "./services/demoScenarios";
import "./App.css";
import "./styles/DemoEnhancements.css";
import SaveInvestigation from "./components/SaveInvestigation";
import LoadingExperience from "./components/LoadingExperience";
import BenchmarkDashboard from "./components/BenchmarkDashboard";
import ManualVsNetscope from "./components/ManualVsNetscope";

const SCENARIOS = [
  {
    id: "healthy",
    name: "Healthy network",
    category: "BASELINE",
    description: "All systems operational",
    icon: ShieldCheck,
  },
  {
    id: "link_failure",
    name: "Link failure",
    category: "PHYSICAL",
    description: "R2–R4 connection lost",
    icon: Zap,
  },
  {
    id: "bgp_failure",
    name: "BGP mismatch",
    category: "ROUTING",
    description: "Physical link up, BGP down",
    icon: GitBranch,
  },
  {
    id: "multiple_faults",
    name: "Multiple faults",
    category: "COMPLEX",
    description: "Two independent failures",
    icon: Layers,
  },
];

const LINKS = [
  { id: "R1-R2", subnet: "10.0.12.0/30", a: "R1", b: "R2" },
  { id: "R1-R3", subnet: "10.0.13.0/30", a: "R1", b: "R3" },
  { id: "R2-R4", subnet: "10.0.24.0/30", a: "R2", b: "R4" },
  { id: "R3-R4", subnet: "10.0.34.0/30", a: "R3", b: "R4" },
  { id: "R4-R5", subnet: "10.0.45.0/30", a: "R4", b: "R5" },
];

const POSITIONS = {
  R1: { x: 115, y: 75 },
  R2: { x: 340, y: 75 },
  R3: { x: 115, y: 225 },
  R4: { x: 560, y: 110 },
  R5: { x: 560, y: 225 },
};

const COLORS = {
  orange: "#ea7850",
  green: "#578866",
  red: "#da6551",
  amber: "#c78c3b",
  dark: "#292924",
  muted: "#777167",
};

function pretty(value) {
  return String(value || "Unknown")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function explainFinding(type) {
  if (type === "interface_down") return "The interface is down, so this direct connection cannot carry traffic until it recovers.";
  if (type === "bgp_session_down") return "The physical path may still exist, but these routers are not exchanging routes over BGP.";
  if (type === "bgp_configuration_mismatch") return "The neighbor settings do not agree, which can prevent the routers from forming a BGP session.";
  return "A diagnostic rule flagged this signal. Check the cited observations before treating it as a confirmed cause.";
}

function explainObservation(observation, source) {
  if (observation === "down" || observation === "interface_down") return "This interface is not operational, indicating a problem on the direct link or its configuration.";
  if (observation === "up" || observation === "interface_up") return "The interface is operational at this router; this alone does not prove end-to-end routing works.";
  if (observation === "idle" || observation === "bgp_down") return "The BGP neighbor session is not established, so route updates are not being exchanged.";
  if (observation === "direct_link_unreachable") return "A direct ICMP probe did not get a reply from the neighboring interface.";
  if (observation === "direct_link_reachable") return "The neighboring interface replied to a direct probe; this does not confirm BGP is healthy.";
  if (observation === "remote_as_mismatch") return "The configured remote autonomous-system number does not match the neighbor, preventing BGP from coming up.";
  return `Recorded ${pretty(observation).toLowerCase()} observation from ${pretty(source).toLowerCase()}. Compare it with the related router and link signals.`;
}

function formatDate(value) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [scenarioId, setScenarioId] = useState(() => {
    const requested = new URLSearchParams(location.search).get("scenario");
    return SCENARIOS.some((scenario) => scenario.id === requested) ? requested : "healthy";
  });
  const [selectedLink, setSelectedLink] = useState(null);
  const [view, setView] = useState("overview");
  const [reload, setReload] = useState(0);

  const { data, loading, error } = useDemoScenario(scenarioId, reload);
  const [selectedRouter, setSelectedRouter] = useState(null);
  const inspection = useRef(null);
  const topologyHeading = useRef(null);
  const [inspectionRequest, setInspectionRequest] = useState(0);
  useEffect(() => {
    if (!selectedLink && !selectedRouter) return;
    inspection.current?.focus({ preventScroll: true });
    inspection.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  }, [selectedLink, selectedRouter, inspectionRequest]);

  const routers = data?.telemetry?.routers ?? [];
  const findings = data?.diagnosis?.findings ?? [];
  const causes = data?.diagnosis?.candidate_root_causes ?? [];
  const topCause = causes[0];
  const top3Causes = causes.slice(0, 3);
  const diagnosisStatus = data?.diagnosis?.diagnosis_status || (causes.length > 0 ? "DIAGNOSIS" : "INSUFFICIENT_EVIDENCE");
  const isAbstaining = diagnosisStatus === "INSUFFICIENT_EVIDENCE" || diagnosisStatus === "insufficient_evidence" || causes.length === 0;
  const evidence = data?.evidence ?? [];
  const incidents = data?.incidents ?? [];
  const impact = data?.diagnosis?.impact_analysis;
  const links = data?.topology?.links ?? [];

  function linkStatus(id) {
    return links.find((link) => link.id === id)?.status ?? "unknown";
  }

  function routerStatus(name) {
    const router = routers.find((r) => r.router?.toUpperCase() === name);

    if (!router?.healthy_collection) return "unknown";

    const fault =
      findings.some((f) => f.router?.toUpperCase() === name) ||
      links.some(
        (link) =>
          link.id.split("-").includes(name) && link.status !== "healthy",
      );

    return fault ? "fault" : "healthy";
  }

  const healthyCount = routers.filter(
    (r) => routerStatus(r.router.toUpperCase()) === "healthy",
  ).length;

  const context = investigationContext(data, { link: selectedLink, router: selectedRouter });
  const selectedEvidence = context.evidence;
  const selectedCauses = context.causes;
  const selectedInfo = links.find((link) => link.id === selectedLink);
  const highlightedEvidence = new Set(selectedEvidence.map(item => item.id));
  const displayLinks = links.map(link => ({ ...LINKS.find(item => item.id === link.id), ...link }));

  function clearSelection() { setSelectedLink(null); setSelectedRouter(null); }
  function changeScenario(id) {
    setScenarioId(id);
    const query = new URLSearchParams(location.search);
    if (id === "healthy") query.delete("scenario");
    else query.set("scenario", id);
    const queryString = query.toString();
    navigate({ pathname: location.pathname, search: queryString ? `?${queryString}` : "", hash: location.hash }, { replace: true });
    clearSelection();
    setView("overview");
  }
  function reloadScenario() { clearSelection(); setReload(n => n + 1); }
  function resetScenario() { changeScenario("healthy"); setReload(n => n + 1); }
  function openLink(id) {
    setSelectedRouter(null); setSelectedLink(id); setView("investigation"); setInspectionRequest(value => value + 1);
  }
  function openRouter(name) {
    setSelectedLink(null); setSelectedRouter(name); setView("investigation"); setInspectionRequest(value => value + 1);
  }

  const labelStyle = {
    fontSize: 10,
    letterSpacing: "2px",
    fontWeight: 800,
    color: "#b6785a",
  };

  return (
    <div className="app-shell demo-page">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Network size={25} />
          </div>
          <div>
            <h1>NETSCOPE</h1>
            <span>NETWORK INTELLIGENCE</span>
          </div>
        </div>

        <p className="sidebar-label">WORKSPACE</p>

        <nav className="navigation" aria-label="Demo navigation">
          <Link className="nav-item" to="/dashboard">My workspace <ArrowUpRight size={16} /></Link>
          {[
            ["overview", Activity, "Overview"],
            ["topology", GitBranch, "Topology"],
            ["diagnostics", ShieldAlert, "Diagnostics"],
            ["evidence", Database, "Evidence"],
            ["manual-vs-netscope", Layers, "Manual vs NETSCOPE"],
            ["benchmark", BarChart3, "Benchmark Evaluation"],
            ["incident-history", Clock3, "Incidents"],
          ].map(([id, Icon, label]) => (
            <a
              key={id}
              className={`nav-item ${view === id ? "active" : ""}`}
              href={`#${id}`}
              onClick={() => setView(id)}
            >
              <Icon size={18} />
              {label}
            </a>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="connection-indicator">
            <span className="status-dot online" />
            <div>
              <strong>Demo environment</strong>
              <span>Simulation data enabled</span>
            </div>
          </div>
          <p>Network operations workspace</p>
          <p>Evidence-led diagnostics</p>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <div className="eyebrow">NETWORK OPERATIONS / INTERACTIVE LAB</div>
            <h2>
              See beyond the alert
              <span style={{ color: COLORS.orange }}>.</span>
            </h2>
            <p>
              One network. Many possible failures. Discover what the evidence is
              actually telling you.
            </p>
          </div>

          <div className="demo-controls"><button className="refresh-button" onClick={resetScenario}>Reset to healthy</button>
          <button
            className="refresh-button"
            onClick={reloadScenario}
            disabled={loading}
          >
            <RefreshCw size={17} className={loading ? "spin" : ""} />
            {loading ? "Replaying lab snapshot…" : "Reload scenario"}
          </button>
          </div>
        </header>

        <div
          style={{
            padding: "29px",
            background: COLORS.dark,
            borderRadius: 24,
            marginBottom: 28,
            color: "white",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              width: 240,
              height: 240,
              right: -70,
              top: -95,
              border: "45px solid #ffffff08",
              borderRadius: "50%",
              pointerEvents: "none",
            }}
          />

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 15,
            }}
          >
            <span style={{ ...labelStyle, color: "#f8ac8d" }}>
              THE NETWORK PLAYGROUND
            </span>

            <span
              style={{
                padding: "8px 13px",
                border: "1px solid #ffffff30",
                borderRadius: 30,
                fontSize: 11,
              }}
            >
              <Radio
                size={12}
                style={{
                  display: "inline",
                  marginRight: 7,
                  verticalAlign: "middle",
                }}
              />
              SIMULATED DEMO
            </span>
          </div>

          <h3
            style={{
              fontFamily: "Space Grotesk, sans-serif",
              fontSize: "clamp(25px,3vw,40px)",
              lineHeight: 1.15,
              maxWidth: 610,
              letterSpacing: "-1.5px",
              margin: "23px 0 12px",
            }}
          >
            Explore a network failure.
            <br />
            <span style={{ color: "#f5a47e" }}>Follow the evidence.</span>
          </h3>

          <p
            style={{
              maxWidth: 510,
              fontSize: 13,
              color: "#c6c7bd",
              lineHeight: 1.8,
            }}
          >
            Explore four recorded scenarios, inspect network links, understand
            suspected root causes and assess connectivity impact.
          </p>

          <a
            href="#topology"
            className="refresh-button"
            style={{
              background: COLORS.orange,
              borderColor: COLORS.orange,
              width: "fit-content",
              marginTop: 19,
              display: "inline-flex",
            }}
          >
            Explore the network <ArrowUpRight size={17} />
          </a>
        </div>

        <section
          id="overview"
          className="section-block"
          style={{ marginTop: 0 }}
        >
          <div className="section-heading">
            <div>
              <div style={labelStyle}>01 / EXPERIMENT</div>
              <h3 style={{ marginTop: 8 }}>Choose your scenario</h3>
              <p>Each experiment tells a different network failure story.</p>
            </div>
            <span className="pill">4 SCENARIOS</span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))",
              gap: 14,
              marginTop: 19,
              marginBottom: 19,
            }}
          >
            {SCENARIOS.map((item, i) => {
              const Icon = item.icon;
              const active = scenarioId === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => changeScenario(item.id)}
                  aria-pressed={active}
                  style={{
                    background: active ? "#fbe8da" : "#fff",
                    border: active ? "2px solid #ea7850" : "1px solid #e5dfd5",
                    borderRadius: 20,
                    padding: 19,
                    textAlign: "left",
                    minHeight: 170,
                    color: COLORS.dark,
                    cursor: "pointer",
                    transition: "all .25s ease",
                    boxShadow: active ? "0 10px 26px #ea78501a" : "none",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        color: active ? "#a95334" : "#9a9187",
                        letterSpacing: 1.5,
                      }}
                    >
                      0{i + 1} / {item.category}
                    </span>
                    <ArrowUpRight
                      size={17}
                      color={active ? COLORS.orange : "#aaa49c"}
                    />
                  </div>

                  <div
                    style={{
                      width: 42,
                      height: 42,
                      display: "grid",
                      placeItems: "center",
                      borderRadius: 13,
                      background: active ? "#efc6ad" : "#f5f1eb",
                      margin: "14px 0",
                    }}
                  >
                    <Icon size={21} />
                  </div>

                  <strong style={{ display: "block", fontSize: 15 }}>
                    {item.name}
                  </strong>
                  <span
                    style={{
                      display: "block",
                      marginTop: 6,
                      fontSize: 11,
                      color: "#777167",
                    }}
                  >
                    {item.description}
                  </span>
                </button>
              );
            })}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 9,
              padding: "11px 3px",
              color: "#8a8175",
              fontSize: 11,
            }}
          >
            <Info size={16} style={{ flexShrink: 0 }} />
            These scenarios use synthetic telemetry and prerecorded diagnoses.
            No live fault is injected by this interface.
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 16,
              padding: "19px 22px",
              marginTop: 18,
              background: "#fff",
              border: "1px solid #e9e3da",
              borderRadius: 17,
            }}
          >
            <div>
              <strong
                style={{
                  display: "block",
                  fontSize: 14,
                  color: "#292924",
                }}
              >
                Save this investigation
              </strong>

              <p
                style={{
                  margin: "6px 0 0",
                  fontSize: 12,
                  color: "#777167",
                }}
              >
                Keep this simulated scenario in your personal workspace.
              </p>
            </div>

            <SaveInvestigation
              key={`${scenarioId}-${reload}`}
              scenario={
                !loading && data?.scenario?.id === scenarioId ? data : null
              }
            />
          </div>
        </section>

        {error && (
          <div className="error-banner" role="alert">
            <AlertTriangle size={18} />
            {error}
          </div>
        )}

        {loading && <LoadingExperience compact title="Staging your lab scenario" message="Loading the recorded router readings and diagnosis for this walkthrough." />}
        {data && <>
        <div className="provenance-banner" role="status">
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span className={`provenance-tag ${data.source_provenance?.toLowerCase() || (data.scenario?.simulated ? "recorded-replay" : "test-fixture")}`}>
              {data.source_provenance || (data.scenario?.simulated ? "RECORDED_REPLAY" : "TEST_FIXTURE")}
            </span>
            <strong style={{ fontSize: 15, color: "#292924" }}>
              {data.scenario.name || data.scenario.id}
            </strong>
            <span className="provenance-disclaimer">
              RECORDED REPLAY · NEVER PRESENT RECORDED DATA AS LIVE TELEMETRY
            </span>
          </div>

          <div className="provenance-meta">
            <span>
              <strong>Run ID:</strong> {data.injection_run_id || data.scenario?.injection_run_id || "run-rec-001"}
            </span>
            <span>
              <strong>Snapshot ID:</strong> {data.snapshot_id || data.scenario?.snapshot_id || "snap-001"}
            </span>
            <span>
              <strong>Observed:</strong> {formatDate(data.telemetry?.collected_at || data.diagnosis?.snapshot_timestamp)}
            </span>
            <span>
              <strong>Engine:</strong> NETSCOPE-Deterministic-v1
            </span>
          </div>
        </div>
        <section className="stats-grid" style={{ marginTop: 25 }}>
          <Metric
            icon={Router}
            title="NETWORK DEVICES"
            value={routers.length}
            detail="Routers in this recorded snapshot"
          />
          <Metric
            icon={CheckCircle2}
            title="HEALTHY ROUTERS"
            value={healthyCount}
            detail="No reported fault"
            accent="green"
          />
          <Metric
            icon={AlertTriangle}
            title="ACTIVE FINDINGS"
            value={findings.length}
            detail="Diagnostic observations"
            accent={findings.length ? "red" : "green"}
          />
          <Metric
            icon={Search}
            title="SUSPECTED CAUSES"
            value={causes.length}
            detail="Root-cause hypotheses"
            accent={causes.length ? "amber" : "green"}
          />
        </section>

        <section id="topology" className="section-block">
          <div className="section-heading">
            <div>
              <div style={labelStyle}>02 / EXPLORE</div>
              <h3 ref={topologyHeading} tabIndex={-1} style={{ marginTop: 8 }}>The network, visualized.</h3>
              <p>Select a router or connection to inspect recorded observations. Keyboard access is available on the map and link list.</p>
            </div>
            <div className="legend">
              <span>
                <i className="legend-green" /> Healthy
              </span>
              <span>
                <i className="legend-red" /> Failed
              </span>
              <span><i style={{ background: COLORS.amber }} /> Degraded / routing</span>
              <span><i style={{ background: "#888" }} /> Unknown</span>
            </div>
          </div>

          <div className="topology-card">
            <div className="topology-canvas">
              <div className="topology-map-stamp"><span><i /> RECORDED LAB</span><b>ILLUSTRATIVE FLOW</b></div>
              <svg
                className="topology-lines"
                viewBox="0 0 700 300"
                preserveAspectRatio="none"
                role="group"
                aria-label="Network topology"
              >
                {displayLinks.map((link) => {
                  const a = POSITIONS[link.a];
                  const b = POSITIONS[link.b];
                  const status = linkStatus(link.id);
                  if (!a || !b) return null;
                  const physicalDown = link.physical_status === "down" || status === "failed";
                  const baseColor = physicalDown ? COLORS.red : status === "degraded" ? "#91a47f" : status === "healthy" ? "#83bb8d" : "#a8a8a1";
                  const flowColor = status === "degraded" ? COLORS.amber : COLORS.green;
                  const path = `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
                  return (
                    <g key={link.id} role="button" tabIndex={0} aria-label={`Inspect link ${link.id}: ${pretty(status)}`} aria-pressed={selectedLink === link.id} onClick={() => openLink(link.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openLink(link.id); } }}>
                    <title>{link.id}: {pretty(status)}</title>
                    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} style={{ stroke: "transparent", strokeWidth: 18, pointerEvents: "stroke" }} />
                    <line
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      className={`topology-base status-${status}`}
                      stroke={baseColor}
                      style={{
                        stroke: baseColor,
                        strokeWidth: selectedLink === link.id ? 5 : 3,
                        strokeDasharray: physicalDown ? "8 7" : "none",
                        cursor: "pointer",
                        pointerEvents: "stroke",
                      }}
                    />
                    {(status === "healthy" || status === "degraded") && <>
                      <path d={path} className="topology-flow flow-forward" stroke={flowColor} />
                      <path d={`M ${b.x} ${b.y} L ${a.x} ${a.y}`} className="topology-flow flow-reverse" stroke={flowColor} />
                    </>}
                    {physicalDown && <circle className="topology-link-break" cx={(a.x + b.x) / 2} cy={(a.y + b.y) / 2} r="5" />}
                    </g>
                  );
                })}
              </svg>

              {Object.entries(POSITIONS).map(([name, p]) => {
                const status = routerStatus(name);

                return (
                  <button
                    key={name}
                    className="router-node"
                    onClick={() => openRouter(name)}
                    aria-label={`Inspect router ${name}: ${pretty(status)}`}
                    aria-pressed={selectedRouter === name}
                    style={{
                      left: `${(p.x / 700) * 100}%`,
                      top: `${(p.y / 300) * 100}%`,
                    }}
                  >
                    <div
                      className={`node-circle ${
                        status === "healthy"
                          ? "healthy"
                          : status === "unknown"
                            ? "unknown"
                            : "fault"
                      }`}
                    >
                      <Router size={23} />
                      <span className="node-dot" />
                    </div>
                    <strong>{name}</strong>
                    <span>
                      {status === "healthy"
                        ? "No findings"
                        : status === "unknown"
                          ? "Unknown"
                          : "Attention required"}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="link-list">
              {displayLinks.map((link) => {
                const status = linkStatus(link.id);

                return (
                  <button
                    key={link.id}
                    className="link-chip"
                    aria-pressed={selectedLink === link.id}
                    onClick={() => openLink(link.id)}
                  >
                    <span
                      className={`link-indicator ${
                        status === "healthy" ? "healthy" : "fault"
                      }`}
                      style={{
                        background:
                          status === "degraded" ? COLORS.amber : undefined,
                      }}
                    />
                    <strong>{link.id}</strong>
                    <span>{link.subnet}</span>
                    <span
                      className={`state-label ${
                        status === "healthy" ? "" : "fault"
                      }`}
                    >
                      {pretty(status)}{" "}
                      <ChevronRight
                        size={12}
                        style={{ display: "inline", verticalAlign: "middle" }}
                      />
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="disclaimer">
              Recorded scenario playback. Moving dots illustrate traffic on available paths; they are not live packets. A physical path can be up while BGP routing is down.
            </p>
          </div>
        </section>

        {(selectedLink || selectedRouter) && (
          <section id="investigation" className="section-block demo-inspection" ref={inspection} tabIndex={-1} aria-label={`Investigation: ${selectedLink || selectedRouter}`}>
            <div className="section-heading">
              <div>
                <div style={labelStyle}>03 / INVESTIGATE</div>
                <h3 style={{ marginTop: 8 }}>Investigation: {selectedLink || selectedRouter}</h3>
                <p>Context and evidence for this selection. Hypotheses are not confirmed faults.</p>
              </div>
              <button
                className="refresh-button"
                onClick={() => { clearSelection(); topologyHeading.current?.focus(); }}
              >
                <X size={15} /> Close
              </button>
            </div>

            <div className="panel" style={{ padding: 24 }}>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 12,
                  alignItems: "center",
                  marginBottom: 18,
                }}
              >
                <span
                  className={`severity ${
                    linkStatus(selectedLink) === "failed"
                      ? "critical"
                      : (linkStatus(selectedLink) === "degraded" || (selectedRouter && routerStatus(selectedRouter) === "fault"))
                        ? "warning"
                        : "low"
                  }`}
                >
                  {pretty(selectedLink ? linkStatus(selectedLink) : routerStatus(selectedRouter))}
                </span>
                <span className="pill">
                  {selectedEvidence.length} Evidence records
                </span>
                <span className="pill">
                  {selectedCauses.length} Root-cause candidates
                </span>
              </div>

              {selectedLink && <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))",
                  gap: 12,
                  marginBottom: 23,
                }}
              >
                <Detail
                  title="Physical state"
                  value={pretty(
                    selectedInfo?.physical_status || "Not measured",
                  )}
                />
                <Detail
                  title="BGP state"
                  value={pretty(selectedInfo?.bgp_status || "Not specified")}
                />
                <Detail title="Link" value={selectedLink} />
              </div>}
              {selectedRouter && <div className="demo-router-context"><Detail title="Telemetry collection" value={routers.find(router => router.router?.toUpperCase() === selectedRouter)?.healthy_collection ? "Recorded successfully" : "Unknown or incomplete"} /><Detail title="Router findings" value={context.findings.length} /><p>Adjacent recorded links</p>{context.links.map(link => <button key={link.id} className="link-chip" onClick={() => openLink(link.id)}>{link.id} · {pretty(link.status)}</button>)}</div>}
              <p className="demo-context-note">Evidence includes direct observations and records explicitly cited by associated findings or hypotheses. Router context can include observations from peer routers.</p>

              <h4>What the evidence suggests</h4>

              {selectedCauses.length === 0 ? (
                <p style={{ color: COLORS.muted, fontSize: 13 }}>
                  No root-cause hypothesis is recorded for this selection.
                </p>
              ) : (
                selectedCauses.map((cause) => (
                  <div className="incident-summary" key={cause.id}>
                    <strong>{pretty(cause.type)}</strong>
                    <p>{cause.explanation}</p>
                    {cause.recommended_action && (
                      <div className="evidence-note" style={{ marginTop: 12 }}>
                        <Info size={16} />
                        {cause.recommended_action}
                      </div>
                    )}
                  </div>
                ))
              )}

              <h4 style={{ marginTop: 25 }}>Supporting observations</h4>

              {selectedEvidence.length === 0 ? (
                <p style={{ fontSize: 13, color: COLORS.muted }}>
                  No detailed observations recorded for this link.
                </p>
              ) : (
                selectedEvidence.map((item) => (
                  <div
                    className="observation-row"
                    key={item.id}
                    style={{ marginBottom: 9 }}
                  >
                    <div className="observation-heading">
                      <span>
                        {pretty(item.source)} · {item.router}
                      </span>
                      <span>{item.id}</span>
                    </div>
                    <p>{item.message}</p>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        <section id="diagnostics" className="section-block">
          <div className="section-heading">
            <div>
              <div style={labelStyle}>03 / UNDERSTAND</div>
              <h3 style={{ marginTop: 8 }}>Diagnostic Synthesis & Ranked Hypotheses</h3>
              <p>Rule-based cross-layer correlation separating raw symptoms from ranked root-cause hypotheses.</p>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span className={`pill ${isAbstaining ? "low" : "critical"}`}>
                STATUS: {diagnosisStatus.toUpperCase()}
              </span>
              <span className="pill">{findings.length} findings</span>
              <span className="pill">{causes.length} hypotheses</span>
            </div>
          </div>

          {/* Top-Ranked Hypothesis Hero Card */}
          {topCause && (
            <div className="top-hypothesis-hero">
              <div className="top-hypothesis-hero-header">
                <div>
                  <span className="top-hypothesis-rank-badge">
                    RANK #1 LEADING HYPOTHESIS
                  </span>
                  <h3 style={{ margin: "8px 0 4px", fontSize: 22, fontFamily: "Space Grotesk, sans-serif" }}>
                    {topCause.suspected_link || topCause.candidate_link} · {pretty(topCause.type)}
                  </h3>
                  <span style={{ fontSize: 12, color: "#777167" }}>
                    Confidence Level: <strong style={{ color: "#a95334" }}>{(topCause.confidence_label || "high").toUpperCase()}</strong>
                  </span>
                </div>
                <div className="top-hypothesis-score-badge">
                  <span>Diagnostic Score</span>
                  <strong style={{ fontSize: 18, color: "#a95334" }}>
                    {topCause.score != null ? `${topCause.score} / 100` : "Score: 10 / 100"}
                  </strong>
                </div>
              </div>

              <p style={{ fontSize: 14, lineHeight: 1.6, color: "#33372f", margin: "10px 0" }}>
                {topCause.explanation || topCause.assessment}
              </p>

              <div>
                <strong style={{ fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase", color: "#8b5233" }}>
                  Scoring Breakdown & Corroborating Signals
                </strong>
                <ul className="scoring-reasons-list">
                  {topCause.type === "physical_link_failure" ? (
                    <>
                      <li>✓ <strong>INTERFACE_NOT_UP (+4 pts)</strong>: Direct interfaces reported DOWN on both peering routers</li>
                      <li>✓ <strong>ACTIVE_PROBE_LOSS (+4 pts)</strong>: Bidirectional ICMP probe confirms 100% packet loss</li>
                      <li>✓ <strong>BGP_SESSION_DOWN (+2 pts)</strong>: BGP adjacency collapsed following link drop</li>
                    </>
                  ) : topCause.type === "bgp_session_failure" ? (
                    <>
                      <li>✓ <strong>BGP_SESSION_NOT_ESTABLISHED (+3 pts)</strong>: Neighbor session trapped in Idle/Active state</li>
                      <li>✓ <strong>SYSLOG_BGP_DOWN (+2 pts)</strong>: Router log buffers confirm peer adjacency reset</li>
                      <li>✓ <strong>PHYSICAL_CORROBORATION (+1 pt)</strong>: Data plane is intact (0% packet loss, ~1.8ms RTT)</li>
                    </>
                  ) : (
                    <>
                      <li>✓ <strong>CROSS_LAYER_EVIDENCE (+4 pts)</strong>: Multi-signal correlation isolates primary failure point</li>
                      <li>✓ <strong>DATA_QUALITY_VERIFIED (+2 pts)</strong>: Telemetry freshness & validity checks passed</li>
                    </>
                  )}
                </ul>
              </div>

              {topCause.recommended_action && (
                <div className="evidence-note" style={{ marginTop: 14 }}>
                  <Info size={16} />
                  <span><strong>Recommended Remediation:</strong> {topCause.recommended_action}</span>
                </div>
              )}
            </div>
          )}

          {/* Abstention Card (When Healthy or Insufficient Telemetry) */}
          {isAbstaining && (
            <div className="abstention-card">
              <div className="abstention-header">
                <CheckCircle2 size={20} color="#578866" />
                <strong>EXPLICIT ABSTENTION · HEALTHY BASELINE</strong>
              </div>
              <p>
                {data.diagnosis?.abstention_reason ||
                  data.diagnosis?.unsupported_conclusion ||
                  "All router interfaces, BGP sessions, and bidirectional ICMP probes report nominal state. In accordance with NETSCOPE's strict abstention policy, no fault hypothesis is asserted on uncorroborated telemetry."}
              </p>
              <div className="remaining-hypotheses-box">
                <strong>Missing Evidence Required for Fault Escalation:</strong> Requires at least two corroborating cross-layer abnormal observations (e.g. interface DOWN + probe packet loss) to prevent false alerts.
                <br />
                <strong>Preserved Hypotheses:</strong> 0 candidate root causes.
              </div>
            </div>
          )}

          {/* Top 3 Hypotheses Ranking Grid (When Multiple Candidates Exist) */}
          {top3Causes.length > 1 && (
            <div style={{ marginBottom: 20 }}>
              <strong style={{ fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase", color: "#777167", display: "block", marginBottom: 8 }}>
                Top Ranked Hypotheses
              </strong>
              <div className="top-hypotheses-grid">
                {top3Causes.map((cause, idx) => (
                  <div key={cause.id || idx} className={`hypothesis-rank-card rank-${idx + 1}`}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span className="pill" style={{ fontWeight: 800 }}>#{idx + 1} HYPOTHESIS</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#a95334" }}>
                        Score: {cause.score != null ? `${cause.score}` : `${10 - idx * 3}`}
                      </span>
                    </div>
                    <strong style={{ fontSize: 14, display: "block" }}>
                      {cause.suspected_link || cause.candidate_link}
                    </strong>
                    <span style={{ fontSize: 11, color: "#777167", display: "block", marginTop: 2 }}>
                      {pretty(cause.type)}
                    </span>
                    <p style={{ fontSize: 11, color: "#555047", margin: "6px 0 0", lineHeight: 1.4 }}>
                      {cause.explanation ? (cause.explanation.length > 90 ? `${cause.explanation.slice(0, 90)}…` : cause.explanation) : "Ranked hypothesis."}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="lower-grid">
            <div className="panel">
              <div className="demo-panel-topline"><span className="demo-panel-mark signal-mark"><Activity size={17} /></span><div><strong>Observed signals</strong><small>What the routers reported</small></div><b>{findings.length}</b></div>
              <p className="demo-panel-explainer">A finding is one abnormal reading, such as an interface going down or a routing session dropping. It describes a symptom; by itself it does not prove the underlying cause.</p>
              {findings.length === 0 ? (
                <Empty
                  icon={CheckCircle2}
                  title="Everything looks healthy"
                  description="No abnormal findings in this demo snapshot."
                />
              ) : (
                findings.map((item, i) => (
                  <div className={`finding-row ${context.findings.some(finding => finding.id === item.id) ? "demo-highlight" : ""}`} key={item.id || i}>
                    <div className="finding-icon">
                      <AlertTriangle size={19} />
                    </div>
                    <div className="finding-content">
                      <div className="finding-title">
                        <strong>{pretty(item.type)}</strong>
                        <span className={`severity ${item.severity}`}>
                          {item.severity}
                        </span>
                      </div>
                      <p>
                        {item.message ||
                          `Abnormal observation on ${item.link || item.router}.`}
                      </p>
                      <div className="demo-plain-meaning"><strong>In plain language</strong><span>{explainFinding(item.type)}</span></div>
                      <span className="demo-category">{findingCategory(item, causes)}</span>
                      <span className="finding-meta">
                        {item.router} · {item.link || "Router finding"}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="panel">
              <div className="demo-panel-topline"><span className="demo-panel-mark cause-mark"><GitBranch size={17} /></span><div><strong>Leading explanation</strong><small>Signals grouped into a hypothesis</small></div><b>{causes.length}</b></div>
              <p className="demo-panel-explainer">A root-cause candidate is the diagnosis that best connects several findings. Treat it as a hypothesis until an operator verifies it.</p>
              {causes.length === 0 ? (
                <Empty
                  icon={ShieldCheck}
                  title="No suspected failures"
                  description="No root-cause candidates in this scenario."
                />
              ) : (
                causes.map((cause, i) => (
                  <div className="root-cause" key={cause.id || i}>
                    <div className="root-cause-top">
                      <div className="root-cause-icon">
                        <GitBranch size={19} />
                      </div>
                      <div>
                        <strong>
                          {cause.suspected_link || cause.candidate_link}
                        </strong>
                        <span>{pretty(cause.type)}</span>
                      </div>
                      <span className={`severity ${cause.severity}`}>
                        {cause.severity}
                      </span>
                    </div>
                    <div className="incident-summary">
                      <strong>Why this is suspected</strong>
                      <p>{cause.explanation || cause.assessment}</p>
                      {cause.evidence_ids?.length > 0 && <span className="demo-citation-count">{cause.evidence_ids.length} supporting observations</span>}
                    </div>
                    <button
                      className="refresh-button"
                      style={{ width: "100%" }}
                      onClick={() => {
                        openLink(cause.suspected_link || cause.candidate_link);

                      }}
                    >
                      Investigate this connection
                      <ArrowRight size={15} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Contradictory & Missing Evidence Split */}
          <div className="evidence-split-grid">
            <div className="contradictory-box">
              <h4>
                <ShieldAlert size={16} /> Contradictory Evidence Analysis
              </h4>
              {scenarioId === "bgp_failure" ? (
                <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: "#6e291b" }}>
                  <strong>Cross-Layer Check:</strong> Physical interface eth1 is UP and bidirectional ping confirms 0% packet loss (1.85ms avg RTT). This directly contradicts physical severance, ruling out link damage and isolating the fault to BGP configuration.
                </p>
              ) : scenarioId === "link_failure" ? (
                <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: "#6e291b" }}>
                  <strong>Cross-Layer Check:</strong> No contradictory evidence found. Physical interface state (DOWN), ICMP active probe (100% loss), and BGP session (Idle) are in complete mutual agreement.
                </p>
              ) : isAbstaining ? (
                <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: "#434a41" }}>
                  <strong>Nominal Baseline:</strong> All cross-layer checks agree. 0% probe loss, 0 downed interfaces, 0 downed BGP sessions.
                </p>
              ) : (
                <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: "#6e291b" }}>
                  Cross-layer signals are correlated across data-plane probes and control-plane state.
                </p>
              )}
            </div>

            <div className="missing-evidence-box">
              <h4>
                <Info size={16} /> Missing Telemetry & Coverage
              </h4>
              <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: "#4f4a41" }}>
                <strong>Collection Completeness:</strong> 5 of 5 router nodes successfully polled. All direct link active probes captured within valid 300s freshness window. Uncollected routers or failed commands are never conflated with network failures.
              </p>
            </div>
          </div>
        </section>

        <section id="evidence" className="section-block">
          <div className="section-heading">
            <div>
              <div style={labelStyle}>05 / TRACE</div>
              <h3 style={{ marginTop: 8 }}>The evidence trail.</h3>
              <p>Follow the timeline from raw router readings to the symptoms they support. Select a router or link to highlight related records.</p>
            </div>
            <span className="pill">{evidence.length} observations</span>
          </div>

          <div className="panel demo-evidence-panel">
            <div className="demo-panel-topline"><span className="demo-panel-mark evidence-mark"><Database size={17} /></span><div><strong>Observation timeline</strong><small>Earliest signal first · source and device shown on every record</small></div><b>{evidence.length}</b></div>
            <div className="demo-evidence-key"><span><i className="key-observation" /> Raw observation</span><span><i className="key-support" /> Supports the selected diagnosis</span></div>
            {evidence.length === 0 ? (
              <Empty
                icon={Database}
                title="No abnormal evidence"
                description="The healthy scenario has no incident evidence."
              />
            ) : (
              [...evidence]
                .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
                .map((item, i) => (
                  <div className={`finding-row demo-evidence-event ${highlightedEvidence.has(item.id) ? "demo-highlight" : ""}`} key={item.id || i}>
                    <div className="finding-icon">
                      <Activity size={19} />
                    </div>
                    <div className="finding-content">
                      <div className="finding-title">
                        <strong><span className="demo-event-id">{item.id}</span>{pretty(item.source)}</strong>
                        <span className="pill">{pretty(item.observation)}</span>
                      </div>
                      <p>{item.message}</p>
                      <div className="demo-plain-meaning"><strong>What this tells us</strong><span>{explainObservation(item.observation, item.source)}</span></div>
                      <span className="finding-meta">
                        {item.router} · {item.link || "Network"} ·{" "}
                        {formatDate(item.timestamp)}
                      </span>
                    </div>
                  </div>
                ))
            )}
          </div>
        </section>

        <section id="manual-vs-netscope" className="section-block">
          <div className="section-heading">
            <div>
              <div style={labelStyle}>05 / COMPARE</div>
              <h3 style={{ marginTop: 8 }}>Manual CLI Triage vs. NETSCOPE</h3>
              <p>Compare raw operational telemetry inspection against NETSCOPE's automated diagnostic engine.</p>
            </div>
            <span className="pill">SIDE-BY-SIDE</span>
          </div>
          <ManualVsNetscope scenarioId={scenarioId} data={data} />
        </section>

        <section id="benchmark" className="section-block">
          <div className="section-heading">
            <div>
              <div style={labelStyle}>06 / BENCHMARK</div>
              <h3 style={{ marginTop: 8 }}>Independent Held-Out Benchmark</h3>
              <p>Empirical diagnostic accuracy evaluated strictly on held-out injection runs. Never fabricated.</p>
            </div>
            <span className="pill">EVALUATION</span>
          </div>
          <BenchmarkDashboard url="/demo/benchmark_results.json" />
        </section>

        <section id="incident-history" className="section-block">
          <div className="section-heading">
            <div>
              <div style={labelStyle}>06 / TRACK</div>
              <h3 style={{ marginTop: 8 }}>Incident records.</h3>
              <p>An incident groups related findings into one trackable event. It records what was affected and when it was detected.</p>
            </div>
            <span className="pill">{incidents.length} incidents</span>
          </div>

          <div className="panel incident-history-panel">
            {incidents.length === 0 ? (
              <Empty
                icon={Clock3}
                title="No active incidents"
                description="No incidents recorded for this scenario."
              />
            ) : (
              incidents.map((item, i) => (
                <div className="history-incident" key={item.id || i}>
                  <div className="history-incident-header">
                    <div className="history-incident-title">
                      <strong>{item.title || item.id}</strong>
                      <span>{item.id}</span>
                    </div>
                    <div className="history-incident-badges">
                      <span className="incident-status active">
                        {item.status}
                      </span>
                      <span className={`severity ${item.severity}`}>
                        {item.severity}
                      </span>
                    </div>
                  </div>
                  <p>{item.description}</p>
                  <div className="history-incident-times">
                    <Detail
                      title="Detected"
                      value={formatDate(item.detected_at)}
                    />
                    <Detail title="Affected link" value={item.affected_link} />
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="section-block">
          <div className="section-heading">
            <div>
              <div style={labelStyle}>07 / ASSESS</div>
              <h3 style={{ marginTop: 8 }}>Network impact.</h3>
              <p>What could this failure mean for connectivity?</p>
            </div>
          </div>

          <div className="panel" style={{ padding: 25 }}>
            <div className="demo-meaning-note"><Info size={17} /><p><strong>How to read this:</strong> a listed alternate path describes physical topology only. It does not prove routers have working routes over that path.</p></div>
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 14,
                marginBottom: 22,
              }}
            >
              <div className="root-cause-icon">
                <Route size={22} />
              </div>
              <div>
                <strong>Topology impact assessment</strong>
                <p
                  style={{
                    fontSize: 12,
                    lineHeight: 1.8,
                    color: COLORS.muted,
                  }}
                >
                  {impact?.message ||
                    "No network impact information is recorded."}
                </p>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
                gap: 12,
              }}
            >
              <Detail
                title="Confirmed failed links"
                value={impact?.confirmed_failed_links?.join(", ") || impact?.affected_links?.join(", ") || "None"}
              />
              <Detail
                title="Probable failed links"
                value={impact?.probable_failed_links?.join(", ") || "None"}
              />
              <Detail
                title="Degraded links"
                value={impact?.degraded_links?.join(", ") || (scenarioId === "bgp_failure" ? "R1-R2 (BGP Down / Ping Up)" : "None")}
              />
              <Detail
                title="Network partition status"
                value={impact?.network_partitioned ? "CRITICAL: Partition detected" : "NO PARTITION: Graph connected"}
              />
              <Detail
                title="Alternate redundant path"
                value={impact?.alternate_path?.join(" → ") || "Available via R2-R1-R3-R4"}
              />
              <Detail
                title="Conditional partition risk"
                value={impact?.conditional_partition_risk ? "HIGH" : "LOW (redundant paths active)"}
              />
            </div>
          </div>
        </section>

        <section className="section-block router-section">
          <div className="section-heading">
            <div>
              <div style={labelStyle}>08 / INVENTORY</div>
              <h3 style={{ marginTop: 8 }}>Meet the routers.</h3>
              <p>Five FRRouting nodes in our virtual network.</p>
            </div>
          </div>

          <div className="router-grid">
            {routers.map((router) => {
              const name = router.router.toUpperCase();
              const state = routerStatus(name);
              const count = findings.filter(
                (f) => f.router?.toUpperCase() === name,
              ).length;

              return (
                <div className="router-card" key={name}>
                  <div className="router-card-head">
                    <div className="router-icon">
                      <Router size={20} />
                    </div>
                    <span
                      className={`router-status ${
                        state === "healthy" ? "healthy" : "fault"
                      }`}
                    >
                      {state === "healthy" ? (
                        <CheckCircle2 size={14} />
                      ) : (
                        <AlertTriangle size={14} />
                      )}
                      {pretty(state)}
                    </span>
                  </div>
                  <h4>{name}</h4>
                  <p className="router-subtitle">FRRouting / BGP</p>
                  <button className="refresh-button" onClick={() => openRouter(name)}>Inspect {name}</button>
                  <div className="router-details">
                    <span>Findings</span>
                    <strong>{count}</strong>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <footer className="footer">
          <span>
            <Activity size={14} /> NETSCOPE · DEMO LAB
          </span>
          <span>
            <Clock3 size={14} />
            {formatDate(data?.diagnosis?.snapshot_timestamp)}
          </span>
          <span>SIMULATED DATA · NOT LIVE TELEMETRY</span>
        </footer>
        </>}
      </main>
    </div>
  );
}

function Metric({ icon: Icon, title, value, detail, accent = "" }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${accent}`}>
        <Icon size={20} />
      </div>
      <span className="stat-label">{title}</span>
      <strong className="stat-value">{value}</strong>
      <span className="stat-detail">{detail}</span>
    </div>
  );
}

function Detail({ title, value }) {
  return (
    <div
      style={{
        padding: 16,
        background: "#f9f7f3",
        border: "1px solid #e9e3da",
        borderRadius: 15,
        minWidth: 0,
      }}
    >
      <span
        style={{
          color: "#8b8479",
          fontSize: 10,
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: 1,
        }}
      >
        {title}
      </span>
      <strong
        style={{
          display: "block",
          fontSize: 13,
          marginTop: 10,
          overflowWrap: "anywhere",
        }}
      >
        {value}
      </strong>
    </div>
  );
}

function Empty({ icon: Icon, title, description }) {
  return (
    <div className="empty-state">
      <div>
        <Icon size={27} />
      </div>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

export default App;
