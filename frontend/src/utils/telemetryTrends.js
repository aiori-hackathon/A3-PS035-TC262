export function filterTrendHistory(history, {minutes = 120, link = 'all'} = {}) {
  if (!Array.isArray(history) || !Number.isFinite(minutes) || minutes <= 0) return [];
  const timestamps = history.map(sample => Date.parse(sample?.observed_at)).filter(Number.isFinite);
  if (!timestamps.length) return [];
  const cutoff = Math.max(...timestamps) - minutes * 60_000;
  return history
    .filter(sample => {
      const timestamp = Date.parse(sample?.observed_at);
      return Number.isFinite(timestamp) && timestamp >= cutoff;
    })
    .map(sample => ({
      ...sample,
      links: link === 'all' ? sample.links : sample.links.filter(point => point.link === link),
    }));
}

export function summarizeTrendHistory(history) {
  const points = (Array.isArray(history) ? history : []).flatMap(sample => sample.links || []);
  const finite = field => points.map(point => point[field]).filter(value => Number.isFinite(value) && value >= 0);
  const average = values => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 100) / 100 : null;
  const rtts = finite('rtt_avg_ms');
  const losses = finite('packet_loss_percent');
  return {
    samples: Array.isArray(history) ? history.length : 0,
    probeReadings: points.reduce((sum, point) => sum + (Number.isInteger(point.probes_available) ? point.probes_available : 0), 0),
    probeDirections: points.length,
    averageRttMs: average(rtts),
    averageLossPercent: average(losses),
    peakLossPercent: losses.length ? Math.max(...losses) : null,
  };
}
