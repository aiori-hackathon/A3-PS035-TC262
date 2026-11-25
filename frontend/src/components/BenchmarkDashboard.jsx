import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Database,
  Info,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

export default function BenchmarkDashboard({ url = "/demo/benchmark_results.json" }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    fetch(url, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`Benchmark results unavailable: HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (active) {
          setData(json);
          setError("");
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err.message || "Failed to load benchmark evaluation data.");
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [url, attempt]);

  const reload = () => setAttempt((v) => v + 1);

  if (loading) {
    return (
      <div className="panel" style={{ padding: 32, textAlign: "center" }}>
        <RefreshCw size={24} className="spin" style={{ margin: "0 auto 12px" }} />
        <h3>Loading benchmark results…</h3>
        <p style={{ color: "#777167", fontSize: 13 }}>Reading actual held-out evaluation metrics.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-banner" role="alert" style={{ margin: "16px 0" }}>
        <AlertTriangle size={18} />
        <div>
          <strong>Benchmark evaluation unavailable</strong>
          <p style={{ margin: "4px 0 0", fontSize: 12 }}>{error}</p>
        </div>
        <button className="refresh-button" onClick={reload} style={{ marginLeft: "auto" }}>
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const split = data.dataset_split_details || {};
  const perScenario = data.per_scenario_results || {};
  const perClass = data.per_class_metrics || {};
  const confMat = data.confusion_matrix || {};
  const optModel = data.optional_model;

  const pct = (val) => (val != null ? `${(val * 100).toFixed(1)}%` : "N/A");
  const num = (val) => (val != null ? Number(val).toFixed(val < 1 ? 3 : 2) : "N/A");

  return (
    <div className="benchmark-dashboard" style={{ marginTop: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div>
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: 1.5,
              color: "#a95334",
              textTransform: "uppercase",
            }}
          >
            RIGOROUS EVALUATION
          </span>
          <h3 style={{ margin: "4px 0 0", fontSize: 20, fontFamily: "Space Grotesk, sans-serif" }}>
            Diagnostic Baseline Benchmark
          </h3>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#777167" }}>
            Evaluated strictly on independent held-out injection runs. Never fabricated.
          </p>
        </div>

        <button className="refresh-button" onClick={reload} title="Re-read benchmark results">
          <RefreshCw size={14} /> Refresh metrics
        </button>
      </div>

      {/* Top Level Metric Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <MetricCard
          label="Top-1 Accuracy"
          value={pct(data.top1_accuracy)}
          detail={`${data.fault_cases} fault cases`}
          accent="green"
        />
        <MetricCard
          label="Top-3 Accuracy"
          value={pct(data.top3_accuracy)}
          detail="Rank 1–3 coverage"
          accent="green"
        />
        <MetricCard
          label="Mean Reciprocal Rank"
          value={num(data.mrr)}
          detail="MRR across fault runs"
          accent="amber"
        />
        <MetricCard
          label="Selective Accuracy"
          value={pct(data.selective_accuracy)}
          detail="Non-abstained accuracy"
          accent="green"
        />
        <MetricCard
          label="Abstention Coverage"
          value={pct(data.abstention_coverage)}
          detail="Diagnosis rendered rate"
          accent="blue"
        />
        <MetricCard
          label="False Confident Rate"
          value={pct(data.false_confident_diagnosis_rate)}
          detail="Incorrect non-abstained"
          accent={data.false_confident_diagnosis_rate === 0 ? "green" : "red"}
        />
        <MetricCard
          label="Unsupported Abstention"
          value={pct(data.unsupported_abstention_accuracy)}
          detail="Healthy baseline abstention"
          accent="green"
        />
        <MetricCard
          label="Evaluated Runs"
          value={data.labeled_records}
          detail={`${data.independent_runs} independent runs`}
          accent="dark"
        />
      </div>

      {/* Dataset Split & Limitation Disclosure */}
      <div
        style={{
          padding: 18,
          background: "#faf6eb",
          border: "1px solid #e5ddca",
          borderRadius: 14,
          marginBottom: 24,
          fontSize: 12,
          color: "#52554b",
          lineHeight: 1.6,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Info size={16} color="#946130" />
          <strong style={{ color: "#4b4a3e" }}>Dataset Split & Independence Disclosure</strong>
        </div>
        <p style={{ margin: "0 0 6px" }}>
          {split.limitation_disclosure ||
            "Evaluated strictly on independent held-out runs. No synthetic samples manufactured."}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 8, fontSize: 11 }}>
          <span>
            <b>Total Records:</b> {split.total_records ?? data.labeled_records}
          </span>
          <span>
            <b>Held-Out Records:</b> {split.held_out_records ?? data.held_out_records}
          </span>
          <span>
            <b>Training Records:</b> {split.training_records ?? 0}
          </span>
          <span>
            <b>Independent Injection Runs:</b> {split.independent_held_out_runs ?? data.independent_runs}
          </span>
        </div>
      </div>

      {/* Per-Scenario Results Table */}
      {Object.keys(perScenario).length > 0 && (
        <div className="panel" style={{ padding: 20, marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <BarChart3 size={18} color="#a95334" />
            <h4 style={{ margin: 0, fontSize: 14 }}>Per-Scenario Evaluation Breakdown</h4>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="benchmark-table" style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e9e3da", textAlign: "left", color: "#8a8175" }}>
                  <th style={{ padding: "8px 10px" }}>Scenario ID</th>
                  <th style={{ padding: "8px 10px" }}>Total Runs</th>
                  <th style={{ padding: "8px 10px" }}>Top-1 Matches</th>
                  <th style={{ padding: "8px 10px" }}>Abstentions</th>
                  <th style={{ padding: "8px 10px" }}>Accuracy</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(perScenario).map(([scen, metrics]) => (
                  <tr key={scen} style={{ borderBottom: "1px solid #f2eee8" }}>
                    <td style={{ padding: "8px 10px", fontWeight: 700, fontFamily: "monospace" }}>{scen}</td>
                    <td style={{ padding: "8px 10px" }}>{metrics.total_runs}</td>
                    <td style={{ padding: "8px 10px" }}>{metrics.top1_matches}</td>
                    <td style={{ padding: "8px 10px" }}>{metrics.abstentions}</td>
                    <td style={{ padding: "8px 10px", fontWeight: 700, color: metrics.accuracy === 1 ? "#355941" : "#888" }}>
                      {pct(metrics.accuracy)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Per-Class Precision & Recall Table */}
      {Object.keys(perClass).length > 0 && (
        <div className="panel" style={{ padding: 20, marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <ShieldCheck size={18} color="#355941" />
            <h4 style={{ margin: 0, fontSize: 14 }}>Per-Class Diagnostic Precision & Recall</h4>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="benchmark-table" style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e9e3da", textAlign: "left", color: "#8a8175" }}>
                  <th style={{ padding: "8px 10px" }}>Target Class</th>
                  <th style={{ padding: "8px 10px" }}>Support</th>
                  <th style={{ padding: "8px 10px" }}>True Positives</th>
                  <th style={{ padding: "8px 10px" }}>False Positives</th>
                  <th style={{ padding: "8px 10px" }}>False Negatives</th>
                  <th style={{ padding: "8px 10px" }}>Precision</th>
                  <th style={{ padding: "8px 10px" }}>Recall</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(perClass).map(([cls, row]) => (
                  <tr key={cls} style={{ borderBottom: "1px solid #f2eee8" }}>
                    <td style={{ padding: "8px 10px", fontWeight: 700, fontFamily: "monospace" }}>{cls}</td>
                    <td style={{ padding: "8px 10px" }}>{row.support}</td>
                    <td style={{ padding: "8px 10px" }}>{row.true_positives}</td>
                    <td style={{ padding: "8px 10px" }}>{row.false_positives}</td>
                    <td style={{ padding: "8px 10px" }}>{row.false_negatives}</td>
                    <td style={{ padding: "8px 10px", fontWeight: 700 }}>{pct(row.precision)}</td>
                    <td style={{ padding: "8px 10px", fontWeight: 700 }}>{pct(row.recall)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2D Confusion Matrix Table */}
      {Object.keys(confMat).length > 0 && (
        <div className="panel" style={{ padding: 20, marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <Database size={18} color="#a95334" />
            <h4 style={{ margin: 0, fontSize: 14 }}>Confusion Matrix (Actual vs. Predicted)</h4>
          </div>
          <div style={{ overflowX: "auto" }}>
            {(() => {
              const allCols = sortedCols(confMat);
              return (
                <table className="benchmark-table" style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e9e3da", textAlign: "left", color: "#8a8175" }}>
                      <th style={{ padding: "8px 10px" }}>Actual \ Predicted</th>
                      {allCols.map((col) => (
                        <th key={col} style={{ padding: "8px 10px", fontFamily: "monospace" }}>
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(confMat).map(([actual, colMap]) => (
                      <tr key={actual} style={{ borderBottom: "1px solid #f2eee8" }}>
                        <td style={{ padding: "8px 10px", fontWeight: 700, fontFamily: "monospace" }}>{actual}</td>
                        {allCols.map((col) => {
                          const count = colMap[col] || 0;
                          const isDiagonal = actual === col;
                          return (
                            <td
                              key={col}
                              style={{
                                padding: "8px 10px",
                                background: count > 0 && isDiagonal ? "#e8eee2" : count > 0 ? "#fff0dc" : "transparent",
                                fontWeight: count > 0 ? 700 : 400,
                                color: count > 0 && isDiagonal ? "#355941" : count > 0 ? "#a95334" : "#999",
                              }}
                            >
                              {count}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()}
          </div>
        </div>
      )}

      {/* Optional Model Comparison (if present) */}
      {optModel && (
        <div className="panel" style={{ padding: 20, marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <ShieldAlert size={18} color="#815015" />
            <h4 style={{ margin: 0, fontSize: 14 }}>Deterministic Rule Baseline vs. Optional Naive Bayes</h4>
            <span className="pill" style={{ fontSize: 9 }}>EXPERIMENTAL</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="benchmark-table" style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e9e3da", textAlign: "left", color: "#8a8175" }}>
                  <th style={{ padding: "8px 10px" }}>Evaluation Metric</th>
                  <th style={{ padding: "8px 10px" }}>Deterministic Rule Baseline</th>
                  <th style={{ padding: "8px 10px" }}>Bernoulli Naive Bayes (Optional)</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: "1px solid #f2eee8" }}>
                  <td style={{ padding: "8px 10px", fontWeight: 600 }}>Top-1 Accuracy</td>
                  <td style={{ padding: "8px 10px", fontWeight: 700 }}>{pct(data.top1_accuracy)}</td>
                  <td style={{ padding: "8px 10px" }}>{pct(optModel.top1_accuracy)}</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #f2eee8" }}>
                  <td style={{ padding: "8px 10px", fontWeight: 600 }}>Top-3 Accuracy</td>
                  <td style={{ padding: "8px 10px", fontWeight: 700 }}>{pct(data.top3_accuracy)}</td>
                  <td style={{ padding: "8px 10px" }}>{pct(optModel.top3_accuracy)}</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #f2eee8" }}>
                  <td style={{ padding: "8px 10px", fontWeight: 600 }}>Mean Reciprocal Rank (MRR)</td>
                  <td style={{ padding: "8px 10px", fontWeight: 700 }}>{num(data.mrr)}</td>
                  <td style={{ padding: "8px 10px" }}>{num(optModel.mrr)}</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #f2eee8" }}>
                  <td style={{ padding: "8px 10px", fontWeight: 600 }}>Unsupported Abstention Accuracy</td>
                  <td style={{ padding: "8px 10px", fontWeight: 700 }}>{pct(data.unsupported_abstention_accuracy)}</td>
                  <td style={{ padding: "8px 10px" }}>{pct(optModel.unsupported_abstention_accuracy)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function sortedCols(confMat) {
  const cols = new Set();
  for (const row of Object.values(confMat)) {
    for (const k of Object.keys(row)) {
      cols.add(k);
    }
  }
  return Array.from(cols).sort();
}

function MetricCard({ label, value, detail, accent = "" }) {
  const colors = {
    green: { bg: "#edf5ed", fg: "#355941", border: "#c4ddc6" },
    amber: { bg: "#fef7ea", fg: "#946130", border: "#f2dfbf" },
    blue: { bg: "#eef4fa", fg: "#375f8a", border: "#c6d9ed" },
    red: { bg: "#faeeeb", fg: "#a9442d", border: "#ecc8bf" },
    dark: { bg: "#f3f0e8", fg: "#30352f", border: "#e0dad0" },
  }[accent] || { bg: "#fbfaf7", fg: "#333", border: "#e5dfd5" };

  return (
    <div
      style={{
        padding: 14,
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: 14,
        minWidth: 0,
      }}
    >
      <span
        style={{
          display: "block",
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: 0.8,
          textTransform: "uppercase",
          color: colors.fg,
          opacity: 0.85,
        }}
      >
        {label}
      </span>
      <strong
        style={{
          display: "block",
          fontSize: 22,
          fontWeight: 800,
          color: colors.fg,
          marginTop: 6,
          fontFamily: "Space Grotesk, sans-serif",
        }}
      >
        {value}
      </strong>
      <span style={{ display: "block", fontSize: 11, color: colors.fg, opacity: 0.8, marginTop: 4 }}>
        {detail}
      </span>
    </div>
  );
}
