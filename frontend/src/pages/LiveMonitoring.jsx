import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../contexts/authState';
import { auth } from '../services/firebase';
import { fetchLiveSnapshot, freshness, liveConfiguration } from '../services/liveApi';
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
  return <div className="workspace-page live-page">
    <header className="workspace-header"><Link className="workspace-brand" to="/dashboard"><span className="workspace-brand-mark">N</span>NETSCOPE.</Link><nav aria-label="Workspace"><Link to="/dashboard">Dashboard</Link><Link to="/dashboard/investigations">Investigations</Link><Link to="/dashboard/investigate">Investigate a fault</Link><Link to="/demo">Demo</Link></nav></header>
    <main className="live-main"><p className="live-eyebrow">AUTHORIZED NETWORK / READ-ONLY</p><h1>Live monitoring</h1><p>Read the latest stored network observations. Refreshing this view does not collect telemetry or control the lab.</p>
      <section className="live-panel" aria-labelledby="connection-title"><h2 id="connection-title">Connection status</h2><p role="status"><strong>{!endpoint ? 'Not configured' : state.loading ? 'Checking backend…' : state.error ? state.denied ? 'Access denied' : 'Backend unavailable' : data ? 'Backend reachable' : 'Not connected'}</strong>{data && ` · ${freshness(data, now)}`}</p>
        {!endpoint && <p>{configurationError || 'A secure Live API has not been configured for this frontend. Demo and saved reports remain available.'}</p>}
        {state.error && <p role="alert" className="live-error">{state.error} {data && 'Showing the last successful snapshot; it is not a current connection.'}</p>}
        <dl className="live-times"><div><dt>Last successful API response</dt><dd>{state.checkedAt ? state.checkedAt.toLocaleString() : 'Not available'}</dd></div><div><dt>Telemetry observed at</dt><dd>{date(data?.observed_at)}</dd></div><div><dt>Server served at</dt><dd>{date(data?.served_at)}</dd></div></dl>
        <div className="live-controls"><button onClick={() => setAttempt(value => value + 1)} disabled={!endpoint || state.loading}>{state.loading ? 'Checking…' : 'Refresh stored snapshot'}</button><label><input type="checkbox" checked={polling} disabled={!endpoint || state.denied} onChange={event => setPolling(event.target.checked)} /> Check every 30 seconds while visible</label></div>
        {state.denied && <p>Automatic checks stopped. Restore your session or request network access, then refresh manually.</p>}
        <p className="live-note">Recent means observed within three minutes. A reachable API does not prove the lab is running. No live measurements are fabricated when the VM is off.</p>
      </section>
      {data && <>
        <section className="live-panel"><h2>Network topology and collection coverage</h2><p>Active ICMP probes measure address reachability at collection time. They do not verify physical link condition or application reachability.</p><p>{data.diagnosis.coverage ? `${data.diagnosis.coverage.routers_collected}/${data.diagnosis.coverage.routers_total} routers collected · ${data.diagnosis.coverage.links_measured}/${data.diagnosis.coverage.links_total} links probed · ${data.diagnosis.coverage.syslog_events} parsed log events` : 'Collection coverage was not included in this snapshot.'}</p><div className="live-routers">{data.routers.map(router => <button key={router.id} aria-pressed={selection === router.id} onClick={() => setSelection(router.id)}><strong>{router.id}</strong><span>{router.status.replaceAll('_',' ')}</span><small>{router.collection_ok ? 'Collection succeeded' : 'Collection incomplete'} · {router.findings_count} findings</small></button>)}</div><div className="live-links">{data.topology.links.map(link => <button key={link.id} aria-pressed={selection === link.id} onClick={() => setSelection(link.id)}><strong>{link.a} ↔ {link.b}</strong><span>{link.status} · probe: {link.physical_status.replaceAll('_',' ')}</span></button>)}</div></section>
        <section className="live-panel"><div className="live-heading"><h2>{selection ? `Observations: ${selection}` : 'Alarms and observations'}</h2>{selection && <button onClick={() => setSelection(null)}>Show all observations</button>}</div><p>Rule-based findings from BGP, interface state, active probes, and available recent logs. This backend does not provide a streaming alarm feed.</p>{related.length ? related.map((item,index) => <article className="live-record" key={index}><strong>{item.type.replaceAll('_',' ')} · {item.severity}</strong><p>{item.message}</p><small>{item.evidence_source?.replaceAll('_',' ') || 'bgp'} · {item.router}{item.neighbor ? ` → ${item.neighbor}` : ''}</small></article>) : <p>No matching findings in this stored snapshot. Absence of findings does not prove reachability.</p>}</section>
        <section className="live-panel"><h2>Active probe measurements</h2><p>Each row is a timestamped-at-snapshot ICMP probe direction. These measurements are observations, not a physical-layer test.</p>{(data.diagnosis.measurements || []).map(link => <article className="live-record" key={link.link}><h3>{link.link}</h3>{(link.observations || []).map((probe,index) => <p key={`${probe.router}-${index}`}><strong>{probe.router?.toUpperCase()} → {probe.target_address || probe.target}:</strong> {probe.available ? `${probe.packets_received ?? '—'}/${probe.packets_sent ?? '—'} replies · ${probe.packet_loss_percent ?? '—'}% loss · ${Number.isFinite(probe.rtt_avg_ms) ? `${probe.rtt_avg_ms} ms average RTT` : 'RTT unavailable'}` : 'Probe unavailable; this is missing evidence.'}</p>)}</article>)}{!data.diagnosis.measurements?.length && <p>No active probe measurements were stored.</p>}</section>
        <section className="live-panel"><h2>Parsed router log events</h2><p>Best-effort events from recent available container logs; an empty list does not prove that no event occurred.</p>{data.diagnosis.syslog_events?.length ? data.diagnosis.syslog_events.map((event,index) => <article className="live-record" key={`${event.router}-${index}`}><strong>{event.router} · {event.event_type?.replaceAll('_',' ')}</strong><p>{event.message}</p></article>) : <p>No matching log events were parsed or available in this snapshot.</p>}</section>
        <section className="live-panel"><h2>Ranked hypotheses and evidence</h2>{data.diagnosis.diagnosis_status === 'insufficient_evidence' && <p role="status">{data.diagnosis.unsupported_conclusion || 'Available evidence does not support a specific fault conclusion.'}</p>}{data.diagnosis.candidate_root_causes.length ? data.diagnosis.candidate_root_causes.map((cause,index) => <article className="live-record" key={cause.candidate_link}><h3>#{cause.rank || index + 1} {cause.candidate_link} · {cause.confidence_label || 'unrated'} confidence · score {cause.score ?? 'not available'}</h3><p>{cause.assessment}</p><p><strong>Supporting signals ({cause.supporting_signals?.length || 0}):</strong> {cause.evidence || 'Not recorded'}</p><button onClick={() => setSelection(cause.candidate_link)}>Inspect related observations</button></article>) : data.diagnosis.diagnosis_status !== 'insufficient_evidence' && <p>No correlated hypotheses in this snapshot.</p>}</section>
        <section className="live-panel"><h2>Estimated network impact</h2><p>{data.diagnosis.impact_analysis?.limitations || 'Impact assessment unavailable.'}</p>{data.diagnosis.impact_analysis?.affected_links?.map(link => <article className="live-record" key={link.link}><strong>{link.link} · {link.impact.replaceAll('_',' ')}</strong><p>{link.assessment}</p></article>)}</section>
        <section className="live-panel"><h2>Recorded incidents</h2><p>Showing the last {data.incidents.length} stored records of {data.incidents_total}. Incident history may have a different observation time from telemetry.</p>{data.incidents.map((incident,index) => <article className="live-record" key={incident.incident_id || index}><strong>{incident.incident_id} · {incident.status}</strong><p>{incident.candidate_link} · {incident.severity}</p><p>{incident.assessment}</p><small>Last observed: {date(incident.last_observed_at)}</small></article>)}{!data.incidents.length && <p>No stored incident records available.</p>}</section>
      </>}
      <p className="live-note">Live data stays in memory for this session. This page has no fault injection, administrative refresh, or automatic save controls.</p>
    </main>
  </div>;
}
