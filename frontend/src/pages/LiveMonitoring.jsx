import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Check, CircleHelp, Clock3, GitBranch, Radio, RefreshCw, Router, ShieldCheck, Wifi, X } from 'lucide-react';
import { useAuth } from '../contexts/authState';
import { auth } from '../services/firebase';
import { fetchLiveSnapshot, freshness, liveConfiguration } from '../services/liveApi';
import { filterIncidents, incidentSpan } from '../utils/incidentHistory';
import '../styles/UserDashboard.css';
import '../styles/LiveMonitoring.css';

const date = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : 'Not available';
export default function LiveMonitoring() {
  const { currentUser } = useAuth();
  return <LiveWorkspace key={currentUser.uid} user={currentUser} />;
}
function LiveWorkspace({ user }) {
  const [{ endpoint, error: configurationError }] = useState(liveConfiguration);
  const [attempt, setAttempt] = useState(0);
  const [polling, setPolling] = useState(false);
  const [state, setState] = useState({ data: null, loading: false, error: '', checkedAt: null, denied: false });
  const [now, setNow] = useState(Date.now);
  const [selection, setSelection] = useState(null);
  const [incidentFilter, setIncidentFilter] = useState('all');
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 10000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!endpoint) return;
    let active = true, timer, running = false, blocked = false;
    const controller = new AbortController();
    async function read() {
      if (!active || running || blocked || document.hidden) return;
      running = true;
      setState(previous => ({ ...previous, loading: true, error: '' }));
      try {
        const data = await fetchLiveSnapshot({ endpoint, user, signal: controller.signal, currentUid: () => auth.currentUser?.uid });
        if (active) setState({ data, loading: false, error: '', checkedAt: new Date(), denied: false });
      } catch (error) {
        if (active) {
          blocked = error.status === 401 || error.status === 403;
          setState(previous => ({ ...previous, data: blocked ? null : previous.data, loading: false, error: error.message || 'Unable to reach the backend.', denied: blocked }));
        }
      } finally {
        running = false;
        if (active && polling && !blocked) timer = setTimeout(read, 30000);
      }
    }
    function visibility() { if (!document.hidden && polling) { clearTimeout(timer); read(); } }
    read(); document.addEventListener('visibilitychange', visibility);
    return () => { active = false; controller.abort(); clearTimeout(timer); document.removeEventListener('visibilitychange', visibility); };
  }, [endpoint, user, attempt, polling]);
  const data = state.data;
  const findings = data?.diagnosis.findings || [];
  const related = selection ? findings.filter(item => item.router === selection || data?.diagnosis.candidate_root_causes.some(cause => cause.candidate_link === selection && cause.observations?.some(observation => observation.router === item.router && observation.neighbor === item.neighbor))) : findings;
  const visibleIncidents = filterIncidents(data?.incidents, incidentFilter);
  const activeIncidentCount = filterIncidents(data?.incidents, 'active').length;
  const resolvedIncidentCount = filterIncidents(data?.incidents, 'resolved').length;
  const reportingRouters = data?.routers.filter(router => router.collection_ok).length || 0;
  const alertCount = findings.length;
  const connectionLabel = !endpoint ? 'Not configured' : state.loading ? 'Connecting' : state.error ? state.denied ? 'Access denied' : 'Backend unavailable' : data ? 'Connected' : 'Waiting for telemetry';
  const topologyNodes = data?.routers.map((router, index, routers) => {
    const angle = (Math.PI * 2 * index / Math.max(routers.length, 1)) - Math.PI / 2;
    return { ...router, x: 50 + 37 * Math.cos(angle), y: 50 + 37 * Math.sin(angle) };
  }) || [];
  const nodeById = new Map(topologyNodes.map(node => [node.id.toLowerCase(), node]));
  const selectedStatus = item => {
    const status = item.status.toLowerCase();
    if (['attention','down','unreachable','error','suspected'].some(value => status.includes(value))) return 'warning';
    if (['healthy','up','ok','connected','running','no_findings'].some(value => status.includes(value))) return 'healthy';
    return 'unknown';
  };
  const linkStatus = link => selectedStatus({ status: link.status === 'healthy' && link.physical_status === 'reachable' ? 'healthy' : link.status });
  return <div className="workspace-page live-page">
    <header className="workspace-header"><Link className="workspace-brand" to="/dashboard"><span className="workspace-brand-mark">N</span>NETSCOPE<span className="live-brand-suffix">/ CONTROL ROOM</span></Link><nav aria-label="Workspace"><Link to="/dashboard">Dashboard</Link><Link to="/dashboard/investigations">Investigations</Link><Link to="/dashboard/investigate">Investigate</Link><Link to="/demo">Demo</Link></nav><div className="live-header-status"><span className={`live-state-dot ${data ? 'is-connected' : state.error ? 'is-error' : ''}`} />{connectionLabel}</div></header>
    <main className="live-main">
      <section className="live-hero">
        <div className="live-hero-copy"><p className="live-eyebrow"><span className="live-eyebrow-dot" /> NETWORK OPERATIONS / READ ONLY</p><h1>Live <span>Monitoring</span></h1><p>One clear view of your network’s health, reachability, and active signals.</p></div>
        <div className="live-hero-actions"><div className="live-auth-badge"><ShieldCheck size={15} /> AUTHENTICATED SESSION</div><button className="live-refresh" onClick={() => setAttempt(value => value + 1)} disabled={!endpoint || state.loading}><RefreshCw size={15} className={state.loading ? 'live-spin' : ''} />{state.loading ? 'Checking' : 'Refresh snapshot'}</button></div>
      </section>
      <section className="live-overview" aria-label="Network summary">
        <article className="live-summary-card live-summary-connection"><span className="live-summary-icon"><Radio size={17} /></span><div><small>API CONNECTION</small><strong className={data ? 'text-good' : state.error ? 'text-bad' : ''}>{connectionLabel}</strong><span>{data ? freshness(data, now) : state.loading ? 'Secure check in progress' : 'Waiting for an authorized snapshot'}</span></div><span className={`live-summary-indicator ${data ? 'is-connected' : ''}`} /></article>
        <article className="live-summary-card"><span className="live-summary-icon"><Router size={17} /></span><div><small>ROUTERS REPORTING</small><strong>{data ? `${reportingRouters}<i>/${data.routers.length}</i>` : '—'}</strong><span>Successful collection</span></div><span className="live-summary-trend"><ArrowUpRight size={16} /></span></article>
        <article className="live-summary-card"><span className="live-summary-icon"><GitBranch size={17} /></span><div><small>LINKS OBSERVED</small><strong>{data ? data.topology.links.length : '—'}</strong><span>Configured topology</span></div><span className="live-summary-trend"><Activity size={16} /></span></article>
        <article className="live-summary-card"><span className={`live-summary-icon ${alertCount ? 'icon-alert' : ''}`}><AlertTriangle size={17} /></span><div><small>OPEN SIGNALS</small><strong className={alertCount ? 'text-warn' : ''}>{data ? alertCount : '—'}</strong><span>{data ? `${activeIncidentCount} active incidents` : 'From recorded findings'}</span></div><span className="live-summary-trend"><ArrowDownRight size={16} /></span></article>
      </section>
      <section className="live-topology-panel" aria-labelledby="topology-title">
        <div className="live-section-head"><div><p className="live-section-kicker">NETWORK MAP <span>•</span> RECORDED STATE</p><h2 id="topology-title">Topology at a glance</h2></div><div className="live-map-tools"><span className="live-map-legend"><i className="legend-good" /> Reporting <i className="legend-warn" /> Attention <i className="legend-unknown" /> Unknown</span><Link className="live-map-action" to="/demo">Explore demo scenarios <ArrowUpRight size={14} /></Link></div></div>
        <div className="live-map-wrap">
          {data?.routers.length ? <div className="live-network-map" aria-label="Router topology visualization">
            <svg className="live-network-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {data.topology.links.map(link => { const a = nodeById.get(link.a.toLowerCase()), b = nodeById.get(link.b.toLowerCase()); return a && b ? <line key={link.id} className={`map-link ${linkStatus(link)}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} /> : null; })}
            </svg>
            <div className="map-center"><span className="map-center-icon"><Activity size={19} /></span><strong>NETSCOPE</strong><small>{data.topology.links.length} LINK PATHS</small></div>
            {topologyNodes.map(node => <button key={node.id} className={`map-router ${selectedStatus(node)} ${selection === node.id ? 'is-selected' : ''}`} style={{ left: `${node.x}%`, top: `${node.y}%` }} aria-pressed={selection === node.id} onClick={() => setSelection(selection === node.id ? null : node.id)}><span className="map-router-core"><Router size={18} /></span><strong>{node.id.toUpperCase()}</strong><small>{node.status.replaceAll('_',' ')}</small></button>)}
            <div className="map-caption"><Wifi size={13} /> {data.diagnosis.coverage ? `${data.diagnosis.coverage.routers_collected} of ${data.diagnosis.coverage.routers_total} routers collected · ${data.diagnosis.coverage.links_measured} of ${data.diagnosis.coverage.links_total} links probed` : 'Topology and collection status from latest stored snapshot'}</div>
          </div> : <div className="live-empty-map"><span className="empty-map-icon"><Router size={24} /></span><strong>{state.loading ? 'Connecting to your network…' : 'Your network map will appear here'}</strong><p>{state.error || (!endpoint ? configurationError || 'Configure the Live API to load an authenticated snapshot.' : 'Waiting for the first authorized telemetry snapshot.')}</p></div>}
          <aside className="live-map-aside">
            <div className="map-aside-heading"><span>COLLECTION STATUS</span><CircleHelp size={14} /></div>
            {data?.routers.length ? data.routers.map(router => <button className="map-router-row" key={router.id} onClick={() => setSelection(router.id)}><span className={`row-status ${selectedStatus(router)}`} /><strong>{router.id.toUpperCase()}</strong><span>{router.collection_ok ? 'Reporting' : 'No recent data'}</span><small>{router.findings_count} signals</small></button>) : <p className="map-aside-empty">Router status appears when the backend returns a snapshot.</p>}
            <div className="map-aside-footer"><Clock3 size={14} /><span>OBSERVED AT</span><strong>{data ? date(data.observed_at) : '—'}</strong></div>
          </aside>
        </div>
        <p className="live-map-disclaimer">Router and link states are drawn from the latest stored snapshot. Select a router to filter its related observations; this page does not control the lab.</p>
      </section>
      <section className="live-status-strip" aria-label="Connection details"><div className="status-strip-title"><span className={`live-state-dot ${data ? 'is-connected' : state.error ? 'is-error' : ''}`} /><strong>{data ? 'Snapshot received' : connectionLabel}</strong></div><div><small>LAST API CHECK</small><span>{state.checkedAt ? state.checkedAt.toLocaleTimeString() : '—'}</span></div><div><small>TELEMETRY OBSERVED</small><span>{date(data?.observed_at)}</span></div><div><small>SERVER RESPONSE</small><span>{date(data?.served_at)}</span></div><label className="live-poll-toggle"><input type="checkbox" checked={polling} disabled={!endpoint || state.denied} onChange={event => setPolling(event.target.checked)} /><span className="toggle-track" /><span>Auto-check <b>30s</b></span></label></section>
      {state.error && <div role="alert" className="live-alert-banner"><AlertTriangle size={17} /><div><strong>{state.denied ? 'Access needs attention' : 'Could not refresh the live API'}</strong><span>{state.error} {data && 'Showing the last successful snapshot.'}</span></div><button aria-label="Retry connection" onClick={() => setAttempt(value => value + 1)}><RefreshCw size={15} /></button></div>}
      {data && <>
        <section className="live-panel live-detail-panel"><div className="live-heading"><div><p className="live-section-kicker">TRIAGE <span>•</span> RECORDED OBSERVATIONS</p><h2>{selection ? `Signals for ${selection}` : 'Alarms and observations'}</h2></div>{selection && <button onClick={() => setSelection(null)}>Clear filter <X size={14} /></button>}</div><p>Rule-based findings from BGP, interface state, active probes, and available recent logs. This backend does not provide a streaming alarm feed.</p>{related.length ? related.map((item,index) => <article className="live-record" key={index}><strong><AlertTriangle size={14} />{item.type.replaceAll('_',' ')} · {item.severity}</strong><p>{item.message}</p><small>{item.evidence_source?.replaceAll('_',' ') || 'bgp'} · {item.router}{item.neighbor ? ` → ${item.neighbor}` : ''}</small></article>) : <p className="live-empty-message"><Check size={16} /> No matching findings in this stored snapshot.</p>}</section>
        <section className="live-panel"><h2>Active probe measurements</h2><p>Each row is a timestamped-at-snapshot ICMP probe direction. These measurements are observations, not a physical-layer test.</p>{(data.diagnosis.measurements || []).map(link => <article className="live-record" key={link.link}><h3>{link.link}</h3>{(link.observations || []).map((probe,index) => <p key={`${probe.router}-${index}`}><strong>{probe.router?.toUpperCase()} → {probe.target_address || probe.target}:</strong> {probe.available ? `${probe.packets_received ?? '—'}/${probe.packets_sent ?? '—'} replies · ${probe.packet_loss_percent ?? '—'}% loss · ${Number.isFinite(probe.rtt_avg_ms) ? `${probe.rtt_avg_ms} ms average RTT` : 'RTT unavailable'}` : 'Probe unavailable; this is missing evidence.'}</p>)}</article>)}{!data.diagnosis.measurements?.length && <p>No active probe measurements were stored.</p>}</section>
        <section className="live-panel"><h2>Parsed router log events</h2><p>Best-effort events from recent available container logs; an empty list does not prove that no event occurred.</p>{data.diagnosis.syslog_events?.length ? data.diagnosis.syslog_events.map((event,index) => <article className="live-record" key={`${event.router}-${index}`}><strong>{event.router} · {event.event_type?.replaceAll('_',' ')}</strong><p>{event.message}</p></article>) : <p>No matching log events were parsed or available in this snapshot.</p>}</section>
        <section className="live-panel"><h2>Ranked hypotheses and evidence</h2>{data.diagnosis.diagnosis_status === 'insufficient_evidence' && <p role="status">{data.diagnosis.unsupported_conclusion || 'Available evidence does not support a specific fault conclusion.'}</p>}{data.diagnosis.candidate_root_causes.length ? data.diagnosis.candidate_root_causes.map((cause,index) => <article className="live-record" key={cause.candidate_link}><h3>#{cause.rank || index + 1} {cause.candidate_link} · {cause.confidence_label || 'unrated'} confidence · score {cause.score ?? 'not available'}</h3><p>{cause.assessment}</p><p><strong>Supporting signals ({cause.supporting_signals?.length || 0}):</strong> {cause.evidence || 'Not recorded'}</p><button onClick={() => setSelection(cause.candidate_link)}>Inspect related observations</button></article>) : data.diagnosis.diagnosis_status !== 'insufficient_evidence' && <p>No correlated hypotheses in this snapshot.</p>}</section>
        <section className="live-panel"><h2>Estimated network impact</h2><p>{data.diagnosis.impact_analysis?.limitations || 'Impact assessment unavailable.'}</p>{data.diagnosis.impact_analysis?.affected_links?.map(link => <article className="live-record" key={link.link}><strong>{link.link} · {link.impact.replaceAll('_',' ')}</strong><p>{link.assessment}</p></article>)}</section>
        <section className="live-panel" aria-labelledby="incident-history-title">
          <div className="live-heading"><h2 id="incident-history-title">Incident history</h2><div className="incident-filters" role="group" aria-label="Filter incident history">
            <button aria-pressed={incidentFilter === 'all'} onClick={() => setIncidentFilter('all')}>All ({data.incidents.length})</button>
            <button aria-pressed={incidentFilter === 'active'} onClick={() => setIncidentFilter('active')}>Active ({activeIncidentCount})</button>
            <button aria-pressed={incidentFilter === 'resolved'} onClick={() => setIncidentFilter('resolved')}>Resolved ({resolvedIncidentCount})</button>
          </div></div>
          <p>Up to 50 recent records are shown, along with any active incidents. The filter applies to this stored history.</p>
          {visibleIncidents.map((incident,index) => <article className="live-record" key={incident.incident_id || index}>
            <strong>{incident.incident_id || `Incident ${index + 1}`} · {incident.status || 'Status unavailable'}</strong>
            <p>{incident.candidate_link || 'Link unavailable'} · {incident.severity || 'Severity unavailable'}</p>
            {incident.assessment && <p>{incident.assessment}</p>}
            <dl className="incident-timeline" aria-label="Incident timeline">
              <div><dt>First observed</dt><dd>{date(incident.first_detected_at)}</dd></div>
              <div><dt>Last observed</dt><dd>{date(incident.last_observed_at)}</dd></div>
              {incident.status === 'RESOLVED' && <div><dt>Resolved</dt><dd>{date(incident.resolved_at)}</dd></div>}
              <div><dt>Observed span</dt><dd>{incidentSpan(incident) || 'Not available'}</dd></div>
            </dl>
          </article>)}
          {!data.incidents.length && <p>No stored incident records available.</p>}
          {data.incidents.length > 0 && !visibleIncidents.length && <p>No incidents match this filter.</p>}
          <small className="incident-total">Total stored incident records: {data.incidents_total}. History is bounded by backend retention.</small>
        </section>
      </>}
      <footer className="live-footer"><ShieldCheck size={14} /><span>Read-only monitoring</span><i>·</i><span>Snapshot data stays in this session</span><i>·</i><span>No fault injection or router control from this page</span></footer>
    </main>
  </div>;
}
