import { useEffect, useState } from "react";
import type { MetricsTimeseries } from "../lab-types";
import { labApi } from "../lib/lab-api";

// One subscription serves the main visualization and the optional diagnostics.
export function useTelemetryHistory() {
  const [windowMinutes, setWindowMinutes] = useState<5 | 10>(5);
  const [history, setHistory] = useState<{ window: number; data: MetricsTimeseries } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    const controller = new AbortController();
    async function refresh() {
      try {
        const data = await labApi.timeseries(windowMinutes, controller.signal);
        if (active) { setHistory({ window: windowMinutes, data }); setError(null); }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Metric history unavailable");
      }
      if (active) timer = window.setTimeout(() => void refresh(), 6_000);
    }
    void refresh();
    return () => { active = false; controller.abort(); if (timer) window.clearTimeout(timer); };
  }, [windowMinutes]);
  return { data: history?.window === windowMinutes ? history.data : null, error, windowMinutes, setWindowMinutes };
}
