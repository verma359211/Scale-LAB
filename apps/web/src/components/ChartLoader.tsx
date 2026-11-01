export function ChartLoader({ aspectRatio }: { aspectRatio?: string }) {
  return <div className="chart-loader" role="status" aria-label="Loading metric history" style={{ aspectRatio }}>
    <span className="chart-loader-spinner" aria-hidden="true" />
    <span className="sr-only">Loading metric history…</span>
  </div>;
}
