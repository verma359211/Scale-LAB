import type { RunState } from "../lab-types";

export function LabActivityFeed({ run }: { run: RunState | null }) {
  const events = run?.events.slice().reverse() ?? [];
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="lab-activity-title">
      <div className="flex items-center justify-between">
        <div>
          <h2 id="lab-activity-title" className="text-base font-semibold text-slate-950">Test activity</h2>
          <p className="mt-1 text-sm text-slate-600">Recorded controller and load-generator events</p>
        </div>
      </div>
      {events.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">No test events yet</div>
      ) : (
        <ol className="mt-4 max-h-72 space-y-1 overflow-auto">
          {events.map((event, index) => (
            <li key={`${event.timestamp}-${index}`} className="grid grid-cols-[68px_1fr] gap-3 border-b border-slate-100 py-2.5 last:border-0">
              <time className="font-mono text-xs text-slate-600">{new Date(event.timestamp).toLocaleTimeString([], { hour12: false })}</time>
              <div><p className="text-sm font-medium text-slate-800">{event.message}</p>{event.detail && <p className="mt-0.5 text-xs text-slate-500">{event.detail}</p>}</div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
