import { useEffect, useState } from "react";
import type { MetricsTimeseries } from "../lab-types";
import { labApi } from "../lib/lab-api";

// One subscription serves the main visualization and the optional diagnostics.
export function useTelemetryHistory() {
  const [windowMinutes, setWindowMinutes] = useState<5 | 10>(5);
  const [history, setHistory] = useState<{ window: number; data: MetricsTimeseries } | null>(null);
  const [failure, setFailure] = useState<{ window: number; message: string } | null>(null);
  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    const controller = new AbortController();
    async function refresh() {
      try {
        const data = await labApi.timeseries(windowMinutes, controller.signal);
        if (active) { setHistory({ window: windowMinutes, data }); setFailure(null); }
      } catch (cause) {
        if (active) setFailure({ window: windowMinutes, message: cause instanceof Error ? cause.message : "Metric history unavailable" });
      }
      if (active) timer = window.setTimeout(() => void refresh(), 6_000);
    }
    void refresh();
    return () => { active = false; controller.abort(); if (timer) window.clearTimeout(timer); };
  }, [windowMinutes]);
  const error = failure?.window === windowMinutes ? failure.message : null;
  const data = history?.window === windowMinutes ? history.data : null;
  return { data, error, loading: !data && !error, windowMinutes, setWindowMinutes };
}
