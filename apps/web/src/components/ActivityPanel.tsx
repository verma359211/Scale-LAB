import type { ActivityEvent } from "../types";

type Props = {
  events: ActivityEvent[];
};

const tones = {
  neutral: "bg-slate-400",
  success: "bg-emerald-500",
  error: "bg-rose-500",
};

export function ActivityPanel({ events }: Props) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="activity-title">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3.5">
        <div>
          <h3 id="activity-title" className="text-sm font-semibold text-slate-950">Live activity</h3>
          <p className="mt-0.5 text-xs text-slate-500">Frontend-visible events only</p>
        </div>
        <span className="flex items-center gap-2 text-[11px] text-slate-500">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Live
        </span>
      </div>

      <div className="max-h-[360px] min-h-52 overflow-y-auto p-2" aria-live="polite">
        {events.length === 0 ? (
          <div className="grid min-h-48 place-items-center px-6 text-center">
            <div>
              <p className="text-sm text-slate-600">Waiting for activity</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">Product requests and orders will appear here.</p>
            </div>
          </div>
        ) : (
          <ul className="space-y-1">
            {events.map((event) => (
              <li key={event.id} className="grid grid-cols-[68px_10px_1fr] gap-2 rounded-lg px-2 py-2.5 hover:bg-slate-50">
                <time className="font-mono text-[11px] text-slate-400">{event.timestamp}</time>
                <span className={`mt-1 h-1.5 w-1.5 rounded-full ${tones[event.tone]}`} />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-700">{event.message}</p>
                  {event.detail && <p className="mt-1 break-words font-mono text-[11px] leading-4 text-slate-400">{event.detail}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
