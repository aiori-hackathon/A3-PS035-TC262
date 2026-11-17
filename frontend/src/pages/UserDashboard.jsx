import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router";
import { ArrowUpRight, FolderSearch, LayoutDashboard, Network, Radio, RefreshCw } from "lucide-react";
import { useAuth } from "../contexts/authState";
import { loadWorkspaceCounts, subscribeRecentInvestigations } from "../services/dashboard";
import { historyError } from "../services/investigationHistory";
import { savedTime, sourceOf, titleOf } from "../utils/investigationList";
import LoadingExperience from "../components/LoadingExperience";
import "../styles/UserDashboard.css";
import "../styles/Dashboard.css";

export default function UserDashboard() {
  const { currentUser } = useAuth();
  return <DashboardWorkspace key={currentUser.uid} />;
}
function DashboardWorkspace() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [version, setVersion] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const logoutPending = useRef(false);
  const displayName = currentUser.displayName?.trim() || currentUser.email?.split("@")[0] || "Operator";

  async function handleLogout() {
    if (logoutPending.current) return;
    logoutPending.current = true;
    setLoggingOut(true); setLogoutError("");
    try { await logout(); navigate("/login", { replace: true }); }
    catch { setLogoutError("Unable to sign out. Please try again."); }
    finally { logoutPending.current = false; setLoggingOut(false); }
  }
  return <div className="workspace-page dashboard-page">
    <a className="dashboard-skip" href="#dashboard-content">Skip to workspace</a>
    <header className="workspace-header">
      <Link to="/" className="workspace-brand"><span className="workspace-brand-mark">N</span>NETSCOPE<span className="workspace-brand-dot">.</span></Link>
      <div className="dashboard-header-actions"><span>Personal workspace</span><button className="workspace-logout" onClick={handleLogout} disabled={loggingOut}>{loggingOut ? "Ending your session…" : "Log out ↗"}</button></div>
    </header>
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <p className="dashboard-eyebrow">WORKSPACE</p>
        <nav aria-label="Workspace navigation">
          <NavLink to="/dashboard" end><LayoutDashboard size={18} />Overview</NavLink>
          <NavLink to="/dashboard/investigations"><FolderSearch size={18} />My Investigations</NavLink>
          <Link to="/demo"><Network size={18} />Demo lab</Link>
          <NavLink to="/dashboard/investigate"><FolderSearch size={18} />Investigate a fault</NavLink>
          <NavLink to="/dashboard/settings"><LayoutDashboard size={18} />Account settings</NavLink>
          <NavLink to="/dashboard/live"><Radio size={18} />Live monitoring</NavLink>
        </nav>
        <div className="dashboard-sidebar-note"><span className="dashboard-offline-dot" />Live status not checked<p>Your saved reports and demo remain available without the network lab.</p></div>
      </aside>
      <main id="dashboard-content" className="dashboard-main" tabIndex={-1}>
        <div className="dashboard-intro"><p className="dashboard-eyebrow">NETWORK INVESTIGATION WORKSPACE</p><h1>Welcome back, <span>{displayName.split(/\s+/)[0]}.</span></h1><p>Review the evidence. Pick up an investigation. Keep uncertainty visible.</p></div>
        {logoutError && <p role="alert" className="dashboard-error">{logoutError}</p>}
        <WorkspaceData key={version} onRefresh={() => setVersion((value) => value + 1)} />
        <section className="dashboard-quick-actions" aria-label="Quick actions">
          <Link to="/demo" className="dashboard-demo-action"><Network size={23} /><h2>Explore the demo lab</h2><p>Inspect simulated faults and save the evidence for later.</p><span>Launch demo <ArrowUpRight size={16} /></span></Link>
          <Link to="/dashboard/investigations"><FolderSearch size={23} /><h2>My Investigations</h2><p>Search your archive, compare observations, and reopen saved reports.</p><span>Browse reports <ArrowUpRight size={16} /></span></Link>
          <Link to="/dashboard/live"><Radio size={23} /><h2>Live monitoring</h2><p>Check authorized backend availability and inspect stored telemetry.</p><span>Open live workspace →</span></Link>
        </section>
        <div className="dashboard-bottom-grid">
          <section id="live-status" className="dashboard-panel" tabIndex={-1} aria-labelledby="live-title"><p className="dashboard-eyebrow">CONNECTION STATUS</p><h2 id="live-title">Live status is checked in its workspace</h2><p>This overview does not connect to the backend. Open Live monitoring to check access and the latest observation time.</p><dl className="dashboard-connection"><div><dt>Telemetry</dt><dd>Not checked here</dd></div><div><dt>Last successful collection</dt><dd>Not available</dd></div></dl><p className="dashboard-muted">The Ubuntu VM must be running for future live monitoring. Demo scenarios are simulated and do not indicate network health.</p></section>
          <AccountCard user={currentUser} displayName={displayName} />
        </div>
        <footer className="dashboard-footer">NETSCOPE · Evidence-based network intelligence<span>Saved hypotheses are not confirmed faults.</span></footer>
      </main>
    </div>
  </div>;
}
function WorkspaceData({ onRefresh }) {
  const [counts, setCounts] = useState(null);
  const [countError, setCountError] = useState("");
  const [recent, setRecent] = useState(null);
  const [recentError, setRecentError] = useState("");
  useEffect(() => {
    let active = true;
    loadWorkspaceCounts().then((result) => { if (active) setCounts(result); }).catch((error) => { if (active) setCountError(historyError(error)); });
    const unsubscribe = subscribeRecentInvestigations((result) => { if (active) { setRecent(result); setRecentError(""); } }, (error) => { if (active) setRecentError(historyError(error)); });
    return () => { active = false; unsubscribe(); };
  }, []);
  const loading = (!counts && !countError) || (!recent && !recentError);
  return <>
    <section aria-labelledby="summary-title">
      <div className="dashboard-section-heading"><div><h2 id="summary-title">Workspace overview</h2><p>{counts ? `Counts checked ${counts.checkedAt.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}. Refresh to update.` : "Counts include all saved records, including legacy reports."}</p></div><button onClick={onRefresh} disabled={loading}><RefreshCw size={15} />{loading ? "Updating your workspace…" : "Refresh workspace"}</button></div>
      <div className="dashboard-metrics" aria-busy={!counts && !countError}>{[["Saved investigations", "total", "All sources, including unclassified records"], ["Demo investigations", "demo", "Saved simulated scenarios"], ["Live investigations", "live", "Saved live snapshots, not active monitoring"]].map(([label,key,caption]) => <div className="dashboard-metric" key={key}><span>{label}</span>{counts ? <strong>{counts[key]}</strong> : countError ? <strong aria-label="Count unavailable">—</strong> : <span className="dashboard-skeleton" aria-label="Gathering saved investigation counts" />}<small>{caption}</small></div>)}</div>
      {countError && <p role="alert" className="dashboard-error">Counts unavailable. {countError}</p>}
    </section>
    <section className="dashboard-panel dashboard-recent" aria-labelledby="recent-title" aria-busy={!recent && !recentError}>
      <div className="dashboard-section-heading"><div><h2 id="recent-title">Recent investigations</h2><p>Up to five latest dated reports. Undated legacy records remain in My Investigations.</p></div><Link to="/dashboard/investigations">View all <ArrowUpRight size={15} /></Link></div>
      {recentError ? <p className="dashboard-error" role="alert">Recent reports unavailable. {recentError}</p> : !recent ? <LoadingExperience compact title="Gathering your recent investigations" message="Checking your saved reports and sorting the latest activity." /> : <>
        {recent.cached && <p className="dashboard-cache" role="status">Showing cached history; waiting for server confirmation. This may be incomplete.</p>}
        {recent.records.length ? <ul className="dashboard-recent-list">{recent.records.map((record) => <li key={record.id}><Link to={`/dashboard/investigations/${record.id}`}><div><h3>{titleOf(record)}</h3><p>{savedTime(record) === null ? "Save date not recorded" : new Date(savedTime(record)).toLocaleString()}</p></div><span className="dashboard-source">{sourceOf(record) === "demo" ? "Demo · simulated" : sourceOf(record) === "live" ? "Live · saved" : "Source unknown"}</span><ArrowUpRight size={18} aria-hidden="true" /></Link></li>)}</ul> : counts?.total === 0 && !recent.cached ? <div className="dashboard-onboarding"><h3>Start with one investigation.</h3><ol><li>Open a simulated network scenario.</li><li>Review its evidence and suspected causes.</li><li>Save the snapshot to build your investigation history.</li></ol><Link to="/demo">Explore your first scenario →</Link></div> : <div className="dashboard-onboarding"><h3>No dated reports available</h3><p>Your archive may contain older metadata-only records. Open My Investigations to see all saved records.</p><Link to="/dashboard/investigations">Open archive →</Link></div>}
      </>}
    </section>
  </>;
}
function AccountCard({ user, displayName }) {
  const [imageFailed, setImageFailed] = useState(false);
  const providers = user.providerData?.map((provider) => provider.providerId) || [];
  const method = [providers.includes("google.com") && "Google", providers.includes("password") && "Email/password"].filter(Boolean).join(" · ") || "Authenticated account";
  return <section className="dashboard-panel" aria-labelledby="account-title"><p className="dashboard-eyebrow">YOUR ACCOUNT</p><h2 id="account-title">Signed in securely</h2><div className="workspace-profile-row">{user.photoURL && !imageFailed ? <img src={user.photoURL} className="workspace-avatar" alt="" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} /> : <div className="workspace-avatar-fallback" aria-hidden="true">{displayName.charAt(0).toUpperCase()}</div>}<div><strong>{displayName}</strong><span>{user.email || "Email not provided"}</span></div></div><dl className="dashboard-connection"><div><dt>Sign-in method</dt><dd>{method}</dd></div>{user.email && <div><dt>Email status</dt><dd>{user.emailVerified ? "Verified" : "Not verified"}</dd></div>}</dl><p className="dashboard-muted">Your investigation archive belongs to this account.</p></section>;
}
