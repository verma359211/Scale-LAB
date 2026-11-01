import { useState } from "react";
import type { RunResult, RunState } from "../lab-types";
import { isRunActive } from "../lib/experiment-presentation";

export function K6Output({ run, result }: { run: RunState | null; result: RunResult | null }) {
  const [copied, setCopied] = useState(false);
  const output = [result?.stdout?.trim(), result?.stderr?.trim() ? `STDERR\n${result.stderr.trim()}` : ""].filter(Boolean).join("\n\n");

  async function copyOutput() {
    if (!output) return;
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(output);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = output;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.append(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  return <details className="k6-output mt-5 overflow-hidden rounded-lg border border-slate-300">
    <summary className="cursor-pointer bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">Detailed k6 Output</summary>
    <div className="flex justify-end border-y border-slate-700 bg-slate-900 px-3 py-2"><button type="button" onClick={() => void copyOutput()} disabled={!output} className="rounded border border-slate-600 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-40">{copied ? "Copied" : "Copy"}</button></div>
    <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-100">{output || (run && isRunActive(run) ? "Waiting for k6 output. Quiet runs may only produce a final summary." : "No k6 output available.")}</pre>
  </details>;
}
