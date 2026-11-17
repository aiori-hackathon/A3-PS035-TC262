import "./LoadingExperience.css";

export default function LoadingExperience({
  title = "Getting your workspace ready",
  message = "Connecting the pieces for your next view.",
  compact = false,
  className = "",
}) {
  const Heading = compact ? "h2" : "h1";
  return (
    <section
      className={`netscope-loading-experience ${compact ? "is-compact" : ""} ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="netscope-loader-visual" aria-hidden="true">
        <span className="netscope-loader-orbit orbit-a" />
        <span className="netscope-loader-orbit orbit-b" />
        <span className="netscope-loader-orbit orbit-c" />
        <svg viewBox="0 0 180 126">
          <path className="netscope-loader-link" d="M30 91 76 40 132 87 153 38M76 40l18 63 38-16" />
          <path className="netscope-loader-flow" d="M30 91 76 40 132 87 153 38M76 40l18 63 38-16" />
          <circle className="netscope-loader-node node-one" cx="30" cy="91" r="7" />
          <circle className="netscope-loader-node node-two" cx="76" cy="40" r="8" />
          <circle className="netscope-loader-node node-three" cx="132" cy="87" r="7" />
          <circle className="netscope-loader-node node-four" cx="153" cy="38" r="6" />
          <circle className="netscope-loader-core" cx="94" cy="103" r="5" />
        </svg>
        <span className="netscope-loader-visual-label">SIGNAL SYNC</span>
      </div>
      <div className="netscope-loader-copy">
        <p className="netscope-loader-eyebrow">NETSCOPE <span>·</span> NETWORK INTELLIGENCE</p>
        <Heading>{title}</Heading>
        <p className="netscope-loader-message">{message}</p>
        <div className="netscope-loader-progress" aria-hidden="true"><span /></div>
        <p className="netscope-loader-footnote">Your evidence stays safe while this view gets ready.</p>
      </div>
    </section>
  );
}
