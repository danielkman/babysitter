const loadingPhases = [
  'Connecting to the Krate workspace',
  'Checking controller health',
  'Refreshing organization resources',
  'Reconciling repository state'
];

export default function Loading() {
  return (
    <section className="krateLoadingView fullPage routeLoading" aria-live="polite" aria-busy="true">
      <div className="krateCircleLoader" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-label="Loading Krate page">
        <svg viewBox="0 0 80 80" className="krateCircleSvg">
          <circle className="krateCircleTrack" cx="40" cy="40" r="34" />
          <circle className="krateCircleArc" cx="40" cy="40" r="34" />
        </svg>
        <span className="krateCircleMark" aria-hidden="true">K</span>
      </div>
      <div className="krateLoadingText">
        <h2>Loading Krate</h2>
        <p>Preparing the workspace compendium.</p>
      </div>
      <p className="krateLoadingPhase routeLoadingPhases">
        {loadingPhases.map((phase) => <span key={phase}>{phase}</span>)}
      </p>
      <small className="krateLoadingFootnote">Showing while this route prepares fresh data.</small>
    </section>
  );
}
