import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { doc, getDoc } from "firebase/firestore";
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  GitBranch,
  Network,
  ShieldCheck,
} from "lucide-react";

import ReportTools from "../components/ReportTools";
import { snapshotOf } from "../utils/investigationList";
import { db } from "../services/firebase";
import { useAuth } from "../contexts/authState";

import "../styles/UserDashboard.css";
import "../styles/InvestigationDetails.css";

function readable(value) {
  if (value === null || value === undefined || value === "") {
    return "Not recorded";
  }

  if (Array.isArray(value)) {
    return value.map(readable).join(" → ");
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function severityTone(value) {
  const severity = String(value || "").toLowerCase();
  if (severity.includes("critical") || severity.includes("emergency")) return "critical";
  if (severity.includes("high") || severity.includes("major")) return "high";
  if (severity.includes("medium") || severity.includes("warning")) return "warning";
  if (severity.includes("low") || severity.includes("info")) return "low";
  return "unknown";
}

function formatDate(value) {
  if (!value) return "Not recorded";

  const date = value?.toDate ? value.toDate() : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function ReportCard({ children, className = "" }) {
  return <div className={`report-card ${className}`}>{children}</div>;
}

function ReportHeading({ icon: Icon, number, title, subtitle }) {
  return (
    <div className="report-section-heading">
      <div className="report-section-icon">
        <Icon size={21} />
      </div>
      <div>
        <span className="report-section-number">{number}</span>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}

function EmptyReportSection({ text }) {
  return <p className="report-empty">{text}</p>;
}

export default function InvestigationDetails() {
  const { investigationId } = useParams();
  const { currentUser } = useAuth();

  return <InvestigationReport key={`${currentUser?.uid}:${investigationId}`} currentUser={currentUser} investigationId={investigationId} />;
}

function InvestigationReport({currentUser, investigationId}) {
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!currentUser?.uid || !investigationId) {
      return;
    }

    let cancelled = false;

    async function loadInvestigation() {
      setLoading(true);
      setError("");
      setRecord(null);

      try {
        const reference = doc(
          db,
          "users",
          currentUser.uid,
          "investigations",
          investigationId,
        );

        const result = await getDoc(reference);

        if (cancelled) return;

        if (!result.exists()) {
          setError("Investigation not found.");
        } else {
          setRecord({
            ...result.data(),
            id: result.id,
          });
        }
      } catch (err) {
        if (cancelled) return;

        console.error("Investigation loading failed:", err);
        setError("Could not load this investigation.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadInvestigation();

    return () => {
      cancelled = true;
    };
  }, [currentUser?.uid, investigationId]);

  const snapshot = record ? snapshotOf(record) : null;
  const snapshotError = record?.snapshotJson && !snapshot ? "Saved snapshot could not be decoded." : "";

  const findings = snapshot?.diagnosis?.findings ?? [];
  const causes = snapshot?.diagnosis?.candidate_root_causes ?? [];
  const evidence = snapshot?.evidence ?? [];
  const incidents = snapshot?.incidents ?? [];
  const impact = snapshot?.diagnosis?.impact_analysis;
  const routers = snapshot?.telemetry?.routers ?? [];
  const links = snapshot?.topology?.links ?? [];

  return (
    <div className="workspace-page">
      <header className="workspace-header">
        <Link to="/" className="workspace-brand">
          <span className="workspace-brand-mark">N</span>
          NETSCOPE<span className="workspace-brand-dot">.</span>
        </Link>

        <Link to="/dashboard" className="report-back-header">
          <ArrowLeft size={16} />
          My workspace
        </Link>
      </header>

      <main className="report-main">
        <Link to="/dashboard/investigations" className="report-back-link">
          <ArrowLeft size={15} />
          Back to investigations
        </Link>

        {loading ? (
          <ReportCard>
            <p>Loading saved investigation...</p>
          </ReportCard>
        ) : error ? (
          <ReportCard>
            <h2>Unable to open report</h2>
            <p>{error}</p>
            <Link to="/dashboard">Return to workspace</Link>
          </ReportCard>
        ) : (
          <>
            <div className="report-hero">
              <div className="report-eyebrow">
                <span className="report-dot" />
                SAVED INVESTIGATION / REPORT
              </div>

              <div className="report-hero-top">
                <div>
                  <h1>{record.title || "Untitled investigation"}</h1>
                  <p>
                    Evidence-based network fault analysis, preserved at the time
                    of saving.
                  </p>
                </div>

                <span className="report-source-badge">
                  {record.source === "demo"
                    ? "SIMULATED DEMO"
                    : record.source === "live" ? "LIVE · STORED SNAPSHOT" : "SAVED INVESTIGATION"}
                </span>
              </div>

              <div className="report-meta">
                <span>
                  <Clock3 size={15} />
                  {formatDate(record.createdAt)}
                </span>
                <span>
                  <Network size={15} />
                  {readable(record.scenarioId)}
                </span>
                <span>
                  <Database size={15} />
                  Saved snapshot
                </span>
              </div>
            </div>

            {snapshot?.investigation && <ReportCard><h2>Investigation provenance</h2><p>Operation: {readable(snapshot.investigation.operation)}</p><p>Observed: {formatDate(snapshot.telemetry?.collected_at)} · Captured: {formatDate(snapshot.investigation.completed_at)}</p><p>{snapshot.investigation.limitation}</p></ReportCard>}
            {!snapshot ? (
              <ReportCard>
                <ReportHeading
                  icon={Database}
                  number="ARCHIVED RECORD"
                  title="Snapshot unavailable"
                  subtitle="This investigation was saved before complete snapshot storage was enabled."
                />

                <p className="report-empty">
                  {snapshotError ||
                    "The original record contains metadata only. Its evidence and diagnosis were not stored."}
                </p>

                <p className="report-empty">
                  You can open Demo Mode and save the scenario again to create a
                  complete investigation report.
                </p>

                <Link to="/demo" className="report-action-link">
                  Open demo →
                </Link>
              </ReportCard>
            ) : (
              <>
                <div className="report-metrics">
                  <div className="report-metric">
                    <span>Diagnostic findings</span>
                    <strong>{findings.length}</strong>
                    <small>Recorded observations</small>
                  </div>

                  <div className="report-metric">
                    <span>Suspected causes</span>
                    <strong>{causes.length}</strong>
                    <small>Root-cause hypotheses</small>
                  </div>

                  <div className="report-metric">
                    <span>Evidence records</span>
                    <strong>{evidence.length}</strong>
                    <small>Supporting telemetry</small>
                  </div>

                  <div className="report-metric">
                    <span>Incidents</span>
                    <strong>{incidents.length}</strong>
                    <small>Recorded incidents</small>
                  </div>
                </div>

                <section className="report-section">
                  <ReportHeading
                    icon={GitBranch}
                    number="01 / DIAGNOSE"
                    title="Root Cause Analysis"
                    subtitle="Suspected failure points and their supporting explanations."
                  />

                  {causes.length === 0 ? (
                    <ReportCard>
                      <div className="report-healthy">
                        <CheckCircle2 size={22} />
                        No root-cause candidates recorded.
                      </div>
                    </ReportCard>
                  ) : (
                    <div className="report-list">
                      {causes.map((cause, index) => (
                        <ReportCard key={cause.id || index} className={`report-cause-card tone-${severityTone(cause.severity)}`}>
                          <div className="report-card-top">
                            <div>
                              <span className="report-small-label">
                                SUSPECTED ROOT CAUSE
                              </span>
                              <h3>
                                {readable(
                                  cause.suspected_link ||
                                    cause.candidate_link ||
                                    cause.type,
                                )}
                              </h3>
                            </div>

                            <span className="report-severity">
                              {readable(cause.severity)}
                            </span>
                          </div>

                          <p className="report-type">{readable(cause.type)}</p>

                          <p className="report-description">
                            {cause.explanation ||
                              cause.assessment ||
                              "No explanation recorded."}
                          </p>

                          {cause.recommended_action && (
                            <div className="report-recommendation">
                              <strong>Recommended action</strong>
                              <p>{cause.recommended_action}</p>
                            </div>
                          )}
                        </ReportCard>
                      ))}
                    </div>
                  )}
                </section>

                {snapshot.diagnosis?.optional_model && <ReportCard><span className="report-small-label">EXPERIMENTAL COMPARISON</span><h2>Optional model comparison</h2><p>{snapshot.diagnosis.optional_model.reason}</p>{snapshot.diagnosis.optional_model.status === "available" && <><p>Method: {readable(snapshot.diagnosis.optional_model.algorithm)} · trained on {snapshot.diagnosis.optional_model.training_runs} runs. Relative scores are not calibrated probabilities.</p>{snapshot.diagnosis.optional_model.predictions?.map(item => <p key={item.candidate_link}><strong>{readable(item.candidate_link)}</strong> · relative score {item.relative_score}</p>)}<small>Signals considered: {(snapshot.diagnosis.optional_model.explanation || []).map(readable).join(", ") || "none"}</small></>}</ReportCard>}

                <section className="report-section">
                  <ReportHeading
                    icon={AlertTriangle}
                    number="02 / OBSERVE"
                    title="Diagnostic Findings"
                    subtitle="Individual abnormalities recorded in this snapshot."
                  />

                  {findings.length === 0 ? (
                    <ReportCard>
                      <EmptyReportSection text="No abnormal findings recorded." />
                    </ReportCard>
                  ) : (
                    <div className="report-list">
                      {findings.map((finding, index) => (
                        <ReportCard key={finding.id || index} className={`report-finding-card tone-${severityTone(finding.severity)}`}>
                          <div className="report-card-top">
                            <h3>{readable(finding.type)}</h3>
                            <span className="report-severity">
                              {readable(finding.severity)}
                            </span>
                          </div>

                          <p className="report-description">
                            {finding.message || "No description recorded."}
                          </p>

                          <p className="report-type">
                            {finding.router || "Unknown router"} ·{" "}
                            {finding.link || "Router-level finding"}
                          </p>
                        </ReportCard>
                      ))}
                    </div>
                  )}
                </section>

                <section className="report-section">
                  <ReportHeading
                    icon={Database}
                    number="03 / TRACE"
                    title="Evidence Trail"
                    subtitle="Supporting observations recorded with the original diagnosis."
                  />

                  {evidence.length === 0 ? (
                    <ReportCard>
                      <EmptyReportSection text="No abnormal evidence recorded." />
                    </ReportCard>
                  ) : (
                    <ReportCard>
                      <div className="report-evidence-list">
                        {[...evidence]
                          .sort(
                            (a, b) =>
                              new Date(a.timestamp || 0) -
                              new Date(b.timestamp || 0),
                          )
                          .map((item, index) => (
                            <div
                              className="report-evidence-item"
                              key={item.id || index}
                            >
                              <div className="report-evidence-marker" />

                              <div className="report-evidence-content">
                                <div className="report-card-top">
                                  <strong>{readable(item.source)}</strong>

                                  <span className="report-evidence-time">
                                    {formatDate(item.timestamp)}
                                  </span>
                                </div>

                                <p>{item.message}</p>

                                <small>
                                  {item.router || "Network"} ·{" "}
                                  {item.link || "General observation"}
                                </small>
                              </div>
                            </div>
                          ))}
                      </div>
                    </ReportCard>
                  )}
                </section>

                <section className="report-section">
                  <ReportHeading
                    icon={Network}
                    number="04 / ASSESS"
                    title="Network Impact"
                    subtitle="Affected links, routing sessions, and alternate paths."
                  />

                  <ReportCard>
                    <p className="report-description">
                      {impact?.message || impact?.limitations || "No impact analysis was recorded."}
                    </p>

                    <div className="report-detail-grid">
                      <div className="report-detail">
                        <span>{record.source === "live" ? "Links in estimated impact" : "Affected physical links"}</span>
                        <strong>
                          {readable(
                            impact?.affected_links?.length
                              ? impact.affected_links
                              : "None recorded",
                          )}
                        </strong>
                      </div>

                      <div className="report-detail">
                        <span>Affected BGP sessions</span>
                        <strong>
                          {readable(
                            impact?.affected_bgp_sessions?.length
                              ? impact.affected_bgp_sessions
                              : "None recorded",
                          )}
                        </strong>
                      </div>

                      <div className="report-detail">
                        <span>Alternate topology path</span>
                        <strong>
                          {readable(
                            impact?.alternate_path?.length
                              ? impact.alternate_path
                              : "Not recorded",
                          )}
                        </strong>
                      </div>

                      <div className="report-detail">
                        <span>Network inventory</span>
                        <strong>
                          {routers.length} routers · {links.length} links
                        </strong>
                      </div>
                    </div>
                  </ReportCard>
                </section>

                <section className="report-section">
                  <ReportHeading
                    icon={ShieldCheck}
                    number="05 / RECORD"
                    title="Incident Records"
                    subtitle="Incidents preserved with the original investigation."
                  />

                  {incidents.length === 0 ? (
                    <ReportCard>
                      <EmptyReportSection text="No incidents recorded for this scenario." />
                    </ReportCard>
                  ) : (
                    <div className="report-list">
                      {incidents.map((incident, index) => (
                        <ReportCard key={incident.id || index} className={`report-incident-card tone-${severityTone(incident.severity)}`}>
                          <div className="report-card-top">
                            <h3>
                              {incident.title ||
                                incident.id || incident.incident_id ||
                                "Untitled incident"}
                            </h3>

                            <span className="report-severity">
                              {readable(incident.severity)}
                            </span>
                          </div>

                          <p className="report-description">
                            {incident.description || incident.assessment || "No description recorded."}
                          </p>

                          <div className="report-incident-meta">
                            <span>Status: {readable(incident.status)}</span>

                            <span>
                              Link: {readable(incident.affected_link || incident.candidate_link)}
                            </span>

                            <span>
                              Detected: {formatDate(incident.detected_at || incident.first_detected_at)}
                            </span>
                          </div>
                        </ReportCard>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}

            <ReportTools record={record} uid={currentUser.uid} />
            <div className="report-disclaimer">
              <ShieldCheck size={17} />
              {record.source === "demo"
                ? "This report contains synthetic telemetry and prerecorded diagnoses. It is not a live network incident."
                : "This report displays the saved investigation record."}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
