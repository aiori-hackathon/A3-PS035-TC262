import { useState } from "react";
import { Link } from "react-router";

import {
  Network,
  Activity,
  ArrowUpRight,
  ArrowRight,
  ShieldCheck,
  GitBranch,
  Radar,
  Route,
  Menu,
  X,
  ChevronDown,
  Fingerprint,
  Layers3,
  RadioTower,
} from "lucide-react";

import IntelligenceCore from "../components/IntelligenceCore";
import "../styles/Landing.css";

const SCENARIOS = [
  {
    id: "healthy",
    label: "Healthy network",
    description: "All five routers are operating normally.",
    status: "All systems operational",
    findings: 0,
    causes: 0,
    color: "green",
  },
  {
    id: "link",
    label: "Physical link failure",
    description: "R2–R4 loses its physical connection.",
    status: "R2–R4 connection failed",
    findings: 4,
    causes: 1,
    color: "red",
  },
  {
    id: "bgp",
    label: "BGP configuration issue",
    description: "Interfaces are up, but BGP adjacency fails.",
    status: "Routing configuration issue",
    findings: 3,
    causes: 1,
    color: "amber",
  },
];

const NODES = {
  R1: [65, 60],
  R2: [245, 60],
  R3: [65, 245],
  R4: [425, 150],
  R5: [425, 245],
};

const LINKS = [
  ["R1", "R2"],
  ["R1", "R3"],
  ["R2", "R4"],
  ["R3", "R4"],
  ["R4", "R5"],
];

function getLinkState(a, b, scenario) {
  const isR2R4 = (a === "R2" && b === "R4") || (a === "R4" && b === "R2");

  if (!isR2R4) return "healthy";

  if (scenario === "link") return "failed";
  if (scenario === "bgp") return "degraded";

  return "healthy";
}

function NetworkPreview({ scenario }) {
  const affected = scenario !== "healthy";

  return (
    <div className="landing-network" data-scenario={scenario}>
      <div className="landing-network-top">
        <div className="landing-live-indicator">
          <span className="landing-pulse" />
          INTERACTIVE NETWORK PREVIEW
        </div>

        <span className="landing-network-count">05 NODES / 05 LINKS</span>
      </div>

      <svg
        viewBox="0 0 490 315"
        className="landing-network-svg"
        role="img"
        aria-label={`Simulated five-router network: ${scenario}`}
      >
        {LINKS.map(([a, b]) => {
          const state = getLinkState(a, b, scenario);
          const [x1, y1] = NODES[a];
          const [x2, y2] = NODES[b];

          return (
            <g key={`${a}-${b}`}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                className={`landing-net-line ${state}`}
              />

              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                className={`landing-net-flow ${state}`}
                aria-hidden="true"
              />

              {state === "failed" && (
                <g className="landing-fault-marker">
                  <circle cx={(x1 + x2) / 2} cy={(y1 + y2) / 2} r="12" />
                  <path d={`M${(x1 + x2) / 2 - 4} ${(y1 + y2) / 2 - 4}l8 8m0-8-8 8`} />
                </g>
              )}
            </g>
          );
        })}

        {Object.entries(NODES).map(([name, [x, y]]) => {
          const isAffected = affected && (name === "R2" || name === "R4");

          return (
            <g
              key={name}
              className={`landing-net-node ${isAffected ? "affected" : ""}`}
              transform={`translate(${x}, ${y})`}
            >
              <circle
                r="29"
                fill={isAffected ? "#6b4b39" : "#3d5847"}
                stroke={isAffected ? "#f0a17b" : "#a5c9ab"}
                strokeWidth="2"
              />

              <circle
                r="34"
                stroke={isAffected ? "#ee795c" : "#a5c9ab"}
                strokeOpacity=".15"
                strokeWidth="5"
                fill="none"
              />

              <text
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#fff"
                fontSize="15"
                fontWeight="700"
              >
                {name}
              </text>

              <circle
                cx="23"
                cy="-23"
                r="5"
                fill={isAffected ? "#efa078" : "#b4dfbb"}
              />
            </g>
          );
        })}
      </svg>

      <div className="landing-network-bottom">
        <span>
          <span className="landing-legend-dot green" />
          Operational
        </span>

        <span>
          <span className="landing-legend-dot red" />
          Physical fault
        </span>

        <span>
          <span className="landing-legend-dot amber" />
          Routing issue
        </span>
      </div>
    </div>
  );
}

function LiveMonitoringPreview() {
  return (
    <div className="landing-live-preview" aria-label="Illustration of NETSCOPE's read-only telemetry workflow">
      <div className="landing-live-preview-head">
        <span><RadioTower size={15} /> LIVE MONITORING / READ ONLY</span>
        <span className="landing-live-preview-state"><i /> SNAPSHOT VIEW</span>
      </div>

      <div className="landing-live-flow" aria-label="Router lab, secure telemetry API, NETSCOPE evidence view">
        <div className="landing-live-flow-step">
          <span className="landing-live-flow-icon"><RadioTower size={23} /></span>
          <strong>Router lab</strong>
          <small>FRR devices</small>
        </div>
        <span className="landing-live-flow-link"><i /></span>
        <div className="landing-live-flow-step is-api">
          <span className="landing-live-flow-icon"><ShieldCheck size={23} /></span>
          <strong>Secure API</strong>
          <small>Authenticated</small>
        </div>
        <span className="landing-live-flow-link"><i /></span>
        <div className="landing-live-flow-step is-console">
          <span className="landing-live-flow-icon"><Radar size={23} /></span>
          <strong>NETSCOPE</strong>
          <small>Evidence view</small>
        </div>
      </div>

      <div className="landing-live-preview-readings">
        <div><small>ROUTER & LINK STATE</small><strong><i className="reading-ok" /> One connected topology</strong><span>Collection coverage and BGP peers</span></div>
        <div><small>PROBES & TRENDS</small><strong><i className="reading-warm" /> Directional reachability</strong><span>RTT, packet loss, and saved history</span></div>
        <div><small>DIAGNOSIS</small><strong><i className="reading-coral" /> Evidence-ranked hypotheses</strong><span>Signals, impact, and incident timeline</span></div>
      </div>
      <p className="landing-live-preview-note">Workflow illustration · values shown in Live Monitoring come from the latest stored snapshot.</p>
    </div>
  );
}

function Feature({ icon: Icon, number, title, description, className = "" }) {
  return (
    <article className={`landing-feature ${className}`}>
      <div className="landing-feature-top">
        <div className="landing-feature-icon">
          <Icon size={25} />
        </div>

        <span>{number} / 06</span>
      </div>

      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>

      <ArrowUpRight size={20} className="landing-feature-arrow" />
    </article>
  );
}

export default function Landing() {
  const [scenarioId, setScenarioId] = useState("healthy");
  const [menuOpen, setMenuOpen] = useState(false);

  const current = SCENARIOS.find((scenario) => scenario.id === scenarioId);

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="landing-page">
      {/* NAVIGATION */}

      <header className="landing-header">
        <Link to="/" className="landing-brand" onClick={closeMenu}>
          <span className="landing-brand-icon">
            <Network size={25} />
          </span>

          <span className="landing-brand-copy">
            <strong>NETSCOPE</strong>
            <small>NETWORK INTELLIGENCE</small>
          </span>
        </Link>

        <nav
          className={`landing-nav ${menuOpen ? "open" : ""}`}
          aria-label="Main navigation"
        >
          <a href="#experience" onClick={closeMenu}>
            Experience
          </a>

          <a href="#features" onClick={closeMenu}>
            Features
          </a>

          <a href="#live-monitoring" onClick={closeMenu}>
            Live monitoring
          </a>

          <a href="#how-it-works" onClick={closeMenu}>
            How it works
          </a>

          <Link to="/login" onClick={closeMenu}>
            Log in
          </Link>

          <Link to="/signup" className="landing-nav-cta" onClick={closeMenu}>
            Get started
            <ArrowUpRight size={16} />
          </Link>
        </nav>

        <button
          type="button"
          className="landing-menu-button"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X size={23} /> : <Menu size={23} />}
        </button>
      </header>

      <main>
        {/* HERO — NEW ANIMATED INTELLIGENCE CORE */}

        <section className="landing-hero">
          <div className="landing-hero-content">
            <div className="landing-kicker">
              <span className="landing-kicker-dot" />
              INTRODUCING NETSCOPE
            </div>

            <h1>
              Networks fail.
              <br />
              <span>Clarity shouldn't.</span>
            </h1>

            <p className="landing-hero-description">
              Follow authenticated router snapshots from network state to
              evidence-ranked fault hypotheses. NETSCOPE brings topology,
              reachability, telemetry trends, and guided investigation into one
              read-only operations workspace.
            </p>

            <div className="landing-hero-actions">
              <Link to="/demo" className="landing-button primary">
                Explore interactive demo
                <ArrowUpRight size={19} />
              </Link>

              <a href="#experience" className="landing-button secondary">
                See how it works
                <ArrowRight size={18} />
              </a>
            </div>

            <div className="landing-hero-note">
              <ShieldCheck size={18} />
              Read-only live monitoring · Simulated demo scenarios
            </div>
          </div>

          <div className="landing-hero-visual">
            <IntelligenceCore />
          </div>

          <a href="#experience" className="landing-scroll-prompt">
            SCROLL TO EXPLORE
            <ChevronDown size={17} />
          </a>
        </section>

        {/* INTERACTIVE NETWORK EXPERIENCE */}

        <section id="experience" className="landing-experience landing-section">
          <div className="landing-section-head">
            <div>
              <div className="landing-eyebrow">01 / INTERACTIVE EXPERIENCE</div>

              <h2>
                Don't just read about it.
                <br />
                <span>See it happen.</span>
              </h2>
            </div>

            <p>
              Explore simulated network failures and see how different symptoms
              point toward different possible root causes.
            </p>
          </div>

          <div className="landing-experience-grid">
            <div className="landing-scenario-panel">
              <div className="landing-panel-eyebrow">SELECT A SCENARIO</div>

              <div className="landing-scenario-list">
                {SCENARIOS.map((scenario, index) => (
                  <button
                    type="button"
                    key={scenario.id}
                    className={`landing-scenario-button ${
                      scenarioId === scenario.id ? "active" : ""
                    }`}
                    onClick={() => setScenarioId(scenario.id)}
                    aria-pressed={scenarioId === scenario.id}
                  >
                    <span className="landing-scenario-number">
                      0{index + 1}
                    </span>

                    <span className="landing-scenario-copy">
                      <strong>{scenario.label}</strong>
                      <small>{scenario.description}</small>
                    </span>

                    <ArrowUpRight size={17} />
                  </button>
                ))}
              </div>

              <Link to="/demo" className="landing-button dark">
                Open full investigation
                <ArrowUpRight size={18} />
              </Link>
            </div>

            <div className="landing-experience-display">
              <div className="landing-display-header">
                <span>NETSCOPE / NETWORK PREVIEW</span>
                <span className="landing-display-live">SIMULATED</span>
              </div>

              <NetworkPreview scenario={scenarioId} />

              <div className="landing-experience-results" key={scenarioId} aria-live="polite">
                <div>
                  <small>FINDINGS</small>
                  <strong>{current.findings}</strong>
                </div>

                <div>
                  <small>ROOT CAUSES</small>
                  <strong>{current.causes}</strong>
                </div>

                <div>
                  <small>ASSESSMENT</small>
                  <strong className="landing-status-text">
                    {current.status}
                  </strong>
                </div>
              </div>

              <p className="landing-demo-disclaimer">
                Illustrative scenario preview with prerecorded diagnostic
                results. No real network fault is being injected.
              </p>
            </div>
          </div>
        </section>

        <section id="live-monitoring" className="landing-live-section landing-section">
          <div className="landing-live-copy">
            <div className="landing-eyebrow">LIVE OPERATIONS / AUTHENTICATED</div>
            <h2>See what your routers report.<br /><span>Follow the evidence.</span></h2>
            <p>Connect the lab collector and NETSCOPE presents its latest stored snapshot: which routers reported, how BGP peers and links look, what directional probes measured, and which observations support each fault hypothesis.</p>
            <ul className="landing-live-points">
              <li><ShieldCheck size={17} /><span><strong>Read-only by design</strong><small>Monitoring reads stored telemetry and never changes router state.</small></span></li>
              <li><Activity size={17} /><span><strong>One connected picture</strong><small>Topology, router status, BGP, probes, trends, and incident history.</small></span></li>
              <li><GitBranch size={17} /><span><strong>Evidence before conclusion</strong><small>Ranked hypotheses link back to the observations behind them.</small></span></li>
            </ul>
            <div className="landing-live-actions">
              <Link to="/dashboard/live" className="landing-button primary">Open live monitoring <ArrowUpRight size={18} /></Link>
              <Link to="/demo" className="landing-text-link">Preview the demo lab <ArrowRight size={17} /></Link>
            </div>
            <small className="landing-live-caveat">Live Monitoring requires an authenticated account and an available telemetry service. Displayed data is snapshot-based, not a continuous packet capture.</small>
          </div>
          <LiveMonitoringPreview />
        </section>

        {/* FEATURES */}

        <section id="features" className="landing-features landing-section">
          <div className="landing-section-head">
            <div>
              <div className="landing-eyebrow">02 / CAPABILITIES</div>

              <h2>
                More than alerts.
                <br />
                <span>Actual understanding.</span>
              </h2>
            </div>

            <p>
              NETSCOPE brings network telemetry, topology, and evidence-based
              fault investigation into one operator-focused workspace.
            </p>
          </div>

          <div className="landing-feature-grid">
            <Feature
              icon={Radar}
              number="01"
              title="Network visibility"
              description="Understand network topology, routing observations and network status from a unified dashboard."
              className="featured"
            />

            <Feature
              icon={GitBranch}
              number="02"
              title="Root-cause correlation"
              description="Connect related observations to identify suspected underlying network failures."
            />

            <Feature
              icon={Route}
              number="03"
              title="Impact intelligence"
              description="Explore alternate topology paths and assess possible network connectivity impact."
            />

            <Feature
              icon={Fingerprint}
              number="04"
              title="Evidence-first investigation"
              description="Trace diagnostic findings to their supporting observations and inspect the evidence."
            />

            <Feature
              icon={Layers3}
              number="05"
              title="Multi-fault scenarios"
              description="Investigate multiple simultaneous failures without assuming every alert has the same cause."
            />

            <Feature
              icon={RadioTower}
              number="06"
              title="Authenticated live monitoring"
              description="Read connected lab snapshots with router and BGP state, directional probes, trends, and incident history—without controlling devices."
            />
          </div>
        </section>

        {/* HOW IT WORKS */}

        <section id="how-it-works" className="landing-how landing-section">
          <div className="landing-section-head">
            <div>
              <div className="landing-eyebrow">03 / HOW IT WORKS</div>

              <h2>
                From noise.
                <br />
                <span>To explanation.</span>
              </h2>
            </div>

            <p>
              A diagnostic workflow built around collecting observations,
              correlating evidence and investigating suspected faults.
            </p>
          </div>

          <div className="landing-steps">
            {[
              {
                n: "01",
                title: "Observe",
                description: "Collect routing and network-state observations.",
              },
              {
                n: "02",
                title: "Correlate",
                description:
                  "Connect abnormal observations with known network topology.",
              },
              {
                n: "03",
                title: "Investigate",
                description:
                  "Examine root-cause hypotheses and supporting evidence.",
              },
              {
                n: "04",
                title: "Assess",
                description:
                  "Estimate network impact and identify useful next checks.",
              },
            ].map((step) => (
              <div className="landing-step" key={step.n}>
                <span>{step.n}</span>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
                <ArrowUpRight size={20} />
              </div>
            ))}
          </div>
        </section>

        {/* FINAL CTA */}

        <section className="landing-cta-section">
          <div className="landing-cta-content">
            <div className="landing-eyebrow">READY TO INVESTIGATE?</div>

            <h2>
              Find the signal.
              <br />
              Follow the evidence.
            </h2>

            <p>
              Explore prerecorded fault scenarios, or sign in to review
              authenticated telemetry from the connected lab.
            </p>

            <div className="landing-hero-actions">
              <Link to="/demo" className="landing-button coral">
                Launch NETSCOPE demo
                <ArrowUpRight size={18} />
              </Link>

              <Link to="/signup" className="landing-button outline-light">
                Create account
                <ArrowRight size={18} />
              </Link>
            </div>
          </div>

          <Network size={190} className="landing-cta-decoration" />
        </section>
      </main>

      {/* FOOTER */}

      <footer className="landing-footer">
        <div className="landing-footer-main">
          <div className="landing-footer-brand">
            <Network size={21} />
            <strong>NETSCOPE</strong>
          </div>
          <p>See beyond the alert.</p>
          <span>Evidence-led network intelligence for clearer incident response.</span>
        </div>

        <nav className="landing-footer-links" aria-label="Footer navigation">
          <div><small>EXPLORE</small><a href="#experience">Experience</a><a href="#live-monitoring">Live monitoring</a><a href="#features">Features</a><Link to="/demo">Demo lab</Link></div>
          <div><small>YOUR SPACE</small><Link to="/login">Log in</Link><Link to="/signup">Create account</Link></div>
        </nav>

        <div className="landing-footer-bottom">
          <span>© {new Date().getFullYear()} NETSCOPE</span>
          <span>Clearer signals. More confident response.</span>
        </div>
      </footer>
    </div>
  );
}
