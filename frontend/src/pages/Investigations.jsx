import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, ArrowUpRight, Search, Trash2, FolderSearch } from "lucide-react";
import { useAuth } from "../contexts/authState";
import { deleteInvestigation, historyError, loadInvestigationBatch } from "../services/investigationHistory";
import { savedTime, selectInvestigations, sourceOf, textValue, titleOf } from "../utils/investigationList";
import LoadingExperience from "../components/LoadingExperience";
import "../styles/UserDashboard.css";
import "../styles/Investigations.css";

const defaults = { search: "", source: "all", scenario: "all", status: "all", sort: "newest", from: "", to: "" };
export default function Investigations() {
  const { currentUser } = useAuth();
  return <InvestigationLibrary key={currentUser.uid} />;
}
function InvestigationLibrary() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filters, setFilters] = useState(defaults);
  const [visible, setVisible] = useState(10);
  const [target, setTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const cursor = useRef(null);
  const busy = useRef(false);
  const deleteBusy = useRef(false);
  const mounted = useRef(false);
  const dialog = useRef(null);
  const focusResults = useRef(false);
  const resultsHeading = useRef(null);

  useEffect(() => {
    let active = true;
    mounted.current = true;
    loadInvestigationBatch().then((batch) => {
      if (!active) return;
      setRecords(batch.records); cursor.current = batch.cursor; setHasMore(batch.hasMore);
    }).catch((err) => { if (active) setError(historyError(err)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; mounted.current = false; };
  }, []);

  useEffect(() => {
    if (target) dialog.current?.showModal();
    else {
      dialog.current?.close();
      if (focusResults.current) {
        resultsHeading.current?.focus();
        focusResults.current = false;
      }
    }
  }, [target]);

  async function loadMore() {
    if (busy.current || loading) return;
    busy.current = true; setLoading(true); setError("");
    try {
      const batch = await loadInvestigationBatch(cursor.current);
      if (!mounted.current) return;
      setRecords((previous) => [...new Map([...previous, ...batch.records].map((record) => [record.id, record])).values()]);
      cursor.current = batch.cursor; setHasMore(batch.hasMore);
    } catch (err) { if (mounted.current) setError(historyError(err)); }
    finally { busy.current = false; if (mounted.current) setLoading(false); }
  }
  function change(name, value) { setFilters((previous) => ({ ...previous, [name]: value })); setVisible(10); }
  function closeDelete() { if (!deleteBusy.current) { setTarget(null); setDeleteError(""); } }
  async function confirmDelete() {
    if (!target || deleteBusy.current) return;
    deleteBusy.current = true; setDeleting(true); setDeleteError("");
    try {
      await deleteInvestigation(target.id);
      if (!mounted.current) return;
      setRecords((previous) => previous.filter((record) => record.id !== target.id));
      setNotice(`“${titleOf(target)}” was deleted.`);
      focusResults.current = true;
      setTarget(null);
    } catch (err) { if (mounted.current) setDeleteError(historyError(err)); }
    finally { deleteBusy.current = false; if (mounted.current) setDeleting(false); }
  }
  const matches = useMemo(() => selectInvestigations(records, filters), [records, filters]);
  const scenarios = [...new Set(records.map((record) => textValue(record.scenarioId, "unknown")))].sort();
  const statuses = [...new Set(records.map((record) => textValue(record.status, "unknown")))].sort();
  const invalidRange = filters.from && filters.to && filters.from > filters.to;

  return <div className="workspace-page investigation-library">
    <header className="workspace-header">
      <Link to="/" className="workspace-brand"><span className="workspace-brand-mark">N</span>NETSCOPE<span className="workspace-brand-dot">.</span></Link>
      <nav aria-label="Workspace"><Link to="/dashboard">Dashboard</Link><Link to="/demo">Open demo <ArrowUpRight size={14} /></Link></nav>
    </header>
    <main className="library-main">
      <Link className="library-back" to="/dashboard"><ArrowLeft size={16} /> My workspace</Link>
      <div className="library-intro"><div><p className="library-eyebrow">YOUR EVIDENCE ARCHIVE</p><h1>My investigations<span>.</span></h1><p>Revisit saved observations, suspected causes, and supporting evidence.</p></div><Link className="library-primary" to="/demo">Explore a scenario <ArrowUpRight size={17} /></Link></div>
      <section className="library-controls" aria-label="Search and filter investigations">
        <label className="library-search"><span><Search size={16} /> Search loaded history</span><input type="search" value={filters.search} onChange={(event) => change("search", event.target.value)} placeholder="Title, scenario, source or fault classification" /></label>
        <div className="library-filter-grid">
          <label>Source<select value={filters.source} onChange={(event) => change("source", event.target.value)}><option value="all">All sources</option><option value="demo">Demo</option><option value="live">Live</option><option value="unknown">Not recorded</option></select></label>
          <label>Scenario<select value={filters.scenario} onChange={(event) => change("scenario", event.target.value)}><option value="all">All scenarios</option>{scenarios.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
          <label>Status<select value={filters.status} onChange={(event) => change("status", event.target.value)}><option value="all">All statuses</option>{statuses.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label>Sort loaded history<select value={filters.sort} onChange={(event) => change("sort", event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="title">Title A–Z</option></select></label>
          <label>Saved from<input type="date" value={filters.from} onChange={(event) => change("from", event.target.value)} /></label>
          <label>Saved through<input type="date" value={filters.to} onChange={(event) => change("to", event.target.value)} /></label>
        </div>
        <div className="library-scope"><p id="history-scope">{records.length} records loaded. {hasMore ? "Search, filters and sorting cover all loaded records, not your entire archive. Load more to extend the search." : "Your entire archive is loaded."} Dates use your local time zone.</p><button onClick={() => { setFilters(defaults); setVisible(10); }}>Clear filters</button></div>
        {invalidRange && <p role="alert">Choose an end date on or after the start date.</p>}
      </section>
      <div className="library-results-heading"><h2 ref={resultsHeading} tabIndex={-1}>Saved reports</h2><span role="status">{matches.length} matching {matches.length === 1 ? "record" : "records"}</span></div>
      {notice && <p className="library-notice" role="status">{notice}</p>}
      {error && <div className="library-error" role="alert">{error} <button disabled={loading} onClick={loadMore}>{loading ? "Reconnecting to history…" : "Retry loading"}</button></div>}
      <section aria-label="Saved investigations" aria-busy={loading}>
        {matches.slice(0, visible).map((record) => <article className="library-record" key={record.id}>
          <div className="library-record-top"><div><div className="library-badges"><span>{sourceOf(record) === "demo" ? "DEMO · SIMULATED" : sourceOf(record) === "live" ? "LIVE · SAVED SNAPSHOT" : "SOURCE NOT RECORDED"}</span><span>{textValue(record.status, "Status not recorded")}</span></div><h3><Link to={`/dashboard/investigations/${record.id}`}>{titleOf(record)}</Link></h3><p>{textValue(record.scenarioId, "Scenario not recorded").replaceAll("_", " ")} · {savedTime(record) === null ? "Save date not recorded" : new Date(savedTime(record)).toLocaleString()}</p></div><span className="library-snapshot">{record.snapshotJson || record.snapshot ? "Snapshot saved" : "Metadata only"}</span></div>
          <div className="library-record-bottom"><dl>{[["Findings", "findingsCount"], ["Suspected causes", "rootCausesCount"], ["Evidence", "evidenceCount"], ["Incidents", "incidentsCount"]].map(([label, field]) => <div key={field}><dt>{label}</dt><dd>{Number.isInteger(record[field]) && record[field] >= 0 ? record[field] : "—"}</dd></div>)}</dl><div className="library-actions"><Link to={`/dashboard/investigations/${record.id}`}>View report <ArrowUpRight size={15} /></Link><button aria-label={`Delete ${titleOf(record)}`} onClick={() => { setDeleteError(""); setTarget(record); }}><Trash2 size={15} /> Delete</button></div></div>
        </article>)}
        {loading && <LoadingExperience compact title="Gathering your investigation history" message="Opening your saved network snapshots." />}
        {!loading && !error && matches.length === 0 && <div className="library-empty"><FolderSearch size={32} /><h3>{records.length ? "No matching investigations" : "No investigations loaded"}</h3><p>{hasMore ? "Load more history to check additional records, or adjust your filters." : records.length ? "Try a different search or clear your filters." : "Save a simulated scenario from the demo to start your archive."}</p>{!records.length && !hasMore && <Link to="/demo">Explore demo →</Link>}</div>}
      </section>
      <div className="library-pagination">{visible < matches.length && <button onClick={() => setVisible((count) => count + 10)}>Show more results ({matches.length - visible} remaining)</button>}{hasMore && <button className="library-primary" onClick={loadMore} disabled={loading}>{loading ? "Finding older reports…" : "Load 25 more records"}</button>}</div>
      <p className="library-footnote">Saved reports preserve past observations. Root-cause hypotheses are not confirmed faults. Demo reports contain simulated data.</p>
    </main>
    <dialog ref={dialog} className="library-dialog" aria-labelledby="delete-title" aria-describedby="delete-description" onCancel={(event) => { event.preventDefault(); closeDelete(); }}>
      <h2 id="delete-title">Delete investigation?</h2><p id="delete-description">“{target ? titleOf(target) : ""}” and its saved snapshot will be permanently deleted. This cannot be undone.</p>
      {deleteError && <p role="alert" className="library-error">{deleteError}</p>}
      <div className="library-actions"><button autoFocus disabled={deleting} onClick={closeDelete}>Cancel</button><button className="library-delete" disabled={deleting} onClick={confirmDelete}>{deleting ? "Removing saved report…" : "Delete investigation"}</button></div>
    </dialog>
  </div>;
}
