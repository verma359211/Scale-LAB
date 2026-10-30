# ScaleLab visitor experience redesign

## Discovery — 29 October 2026

Baseline: clean `main`, commit `263f36a`. Local Vite on 4174; read-only Civo telemetry through a localhost port-forward. No load tests, deployments or infrastructure changes are authorized for this review. Read AGENTS.md, current implementation log, visitor polish plan and live deployment report.

Routes `/` and `/scalelab` render ScaleLab; `/store` renders the ecommerce app. `ScaleLabPage` owns configuration, summary/run/warm-up polling and actions. `LoadTestPanel` owns server-defined preset selection, custom controls and warm start. `TelemetryPanels` owns a separate six-second history subscription. `K6ResultPanel` retains raw output, summaries and cleanup details. SVG charts preserve gaps. Current presets are 150s autoscaling, 75s spike and 90s mixed. Their backend definitions will remain unchanged.

### Measured usability problems

Screenshots saved outside the repository at `C:/Users/verma/Desktop/scalelab-ux-review/before-*.png`. Measurements are CSS pixels with configuration and real telemetry loaded, advanced controls closed, and the existing previous result present.

| Viewport | Start button top | Telemetry heading top | Document height |
|---|---:|---:|---:|
| 1440×900 | 871 | 1562 | 4535 |
| 1366×768 | 871 | 1582 | 4500 |
| 390×844 | 1525 | 3776 | 8788 |

The laptop CTA is below the fold. Three sections (system state, eight metrics, six explanatory steps) separate launcher and charts. A tall intro repeats the project name rather than explaining its central demonstration. Three large cards repeat descriptions/profile information. Previous results blend with current state. Eleven equally prominent charts compete with the scaling story. On mobile those cards and metric rows become a very long queue; chart labels are small. Top, launcher, telemetry and bottom were visually inspected. No horizontal overflow was observed in the baseline.

## Audiences and journeys

- Recruiter: understand real autoscaling → choose default → start explicitly → watch traffic and Ready servers → read measured outcome.
- Developer: switch scenario → follow CPU/desired/readiness relationship → inspect results and architecture → open Store/source.
- Systems engineer: open advanced controls without changing selection → configure workload/warm start → inspect per-pod, latency, database and cache charts → inspect raw k6 output.

## Concepts compared

| Concept | Comprehension / decisions | Action-to-feedback / scrolling | Credibility / mobile | Risk |
|---|---|---|---|---|
| Guided step-by-step wizard | Easy start, several navigation decisions | Results hidden behind steps | Clear but obscures a shared live system; mobile easy | Medium: more workflow state |
| Full-screen chart with floating launcher | Strong visual focus, one action | Short distance, little scrolling | Harder explanations; floating controls obscure small screens | Medium: accessibility/layout |
| Paired experiment workspace **chosen** | Purpose, compact selector, one action | Launcher and live evidence adjacent; depth disclosed | Real measurements and plain labels; ordered mobile stack | Low: reuses existing contracts |

## Information architecture and visual system

Compact heading: “Watch Kubernetes adapt to traffic.” Explain real ecommerce requests in one sentence. A bordered experiment workspace pairs a narrow launcher with a dominant live panel. Scenario alternatives are compact buttons; chosen description/duration come from the server. Start/stop and elapsed workflow state sit together. Advanced Options stays closed and retains every custom capability. Main visualization joins incoming RPS, average CPU relative to request, desired count and Ready count; a replica history and traffic history use aligned time windows with separate units. Pod tiles represent aggregate counts, never fabricated pod identities or lifecycle events.

Results immediately follow the workspace, explicitly labeled previous/completed/stopped/failed. Scaling claims use only samples inside the matching run window and identify partial observation. Detailed Metrics, Run Details, and How It Works reveal secondary content without more than two disclosure levels. Store and verified GitHub links remain visible.

Palette: warm off-white canvas, dark ink, restrained teal for live/Ready, amber for requested capacity or caution, red for failures. System sans typography (no remote font), monospaced numbers. 4/8px spacing rhythm, 12–16px panel radii, 44px controls, consistent focus outlines. Desktop two columns; mobile headline → launcher/action → live feedback → chart. No decorative simulation, flashing activity or gradients.

Principles: [NN/g homepage clarity](https://www.nngroup.com/articles/homepage-design-principles/) informs first-screen purpose/action; [progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/) informs advanced controls and diagnostics; [WCAG 2.2](https://www.w3.org/TR/WCAG22/) informs keyboard, contrast, names and focus; [Core Web Vitals](https://web.dev/articles/vitals/) informs stable layout and restrained rendering. No local measurements will be represented as field CWV.

## Priority implementation plan

1. Preserve API actions and safety; disable start until current-run status is known. Separate unavailable/loading from live zero values.
2. Compact launcher and co-locate true lifecycle feedback, primary action and actual telemetry.
3. Share one history subscription between primary view and optional detailed charts; unmount closed detailed charts.
4. Add concise honest completion summary, bounded run-window scaling observation, and optional architecture/console depth.
5. Verify responsive layouts, state presentation and keyboard interaction; perform a screenshot-driven refinement.
6. Run relevant tests, typechecks and build; update implementation log and release checklist.

## Acceptance and verification plan

CTA fully visible at 1366×768, first visualization in the same first screen; mobile action before charts; no overflow at 390px. Preserve routes, server presets, custom validation, warm-start and restore, stop/cancel, isolated reset confirmation, cleanup/restoration phases, 5/10-minute history and every existing metric. No mutation from page load or selection. Unknown metrics stay unknown; stale data is visibly marked. Stopped tests must not be celebrated as completed. Keyboard controls have visible focus, semantic names and reduced-motion support.

Use real read-only telemetry for screenshots. Use explicit isolated test fixtures only for lifecycle UI verification; do not manufacture production evidence. Existing backend tests verify real action/lifecycle handlers without launching a production workload. A new live start/stop test is deferred until approved. Screenshot review covers desktop/laptop/mobile, advanced controls, detail sections and unavailable states. Review/refinement and measured after-results will be appended below.

## Release checklist

- [x] Local visual review and focused refinement completed
- [x] Tests, typecheck, production build, diff check pass
- [x] User approves visual design
- [x] Build/push a new immutable **web-only** image; update only Civo web image tag
- [x] Apply web Deployment with explicit Civo kubeconfig/context; wait for rollout
- [x] Verify `/`, `/scalelab`, `/store`, GET telemetry and existing API routing
- [ ] Optional separately approved small start/stop smoke; no heavy visual-QA workload
- [ ] Commit/push only after approval; keep previous web image available for rollback

Backend, Kubernetes, secrets, HPA, databases, cache and k6 workloads are outside this redesign.

## Implementation and review — completed 30 October 2026

### Components and behavior

- `apps/web/src/pages/ScaleLabPage.tsx`: paired experiment workspace, current response quality, previous-result summary, and optional Detailed Metrics / Run Details / How It Works sections. Existing API methods remain unchanged. Starting is disabled until current-run status is known; a failed status poll disables controls until recovery.
- `components/LoadTestPanel.tsx`: compact scenario switch, readable server-supplied durations, dominant start action, condensed active-run controls, actual workload identity, elapsed workflow time, preparation/cleanup/restoration explanations. Presets, custom configuration, warm start, cancellation, restore and benchmark reset remain available. Opening Advanced Options does not opt into custom mode.
- New `components/LiveScalingPanel.tsx`: real incoming traffic, CPU, Ready/desired counts, aggregate pod units and aligned traffic/capacity histories. Requested units mean desired minus Ready, not invented Pod identities or proof that scheduling succeeded.
- New `components/ExperimentOutcome.tsx` and `lib/experiment-presentation.ts`: past results separate from live metrics; actual achieved RPS, total requests, failure percentage and p95/p99. Stops and failures retain their true labels. Replica observation excludes samples outside the workload, optional prewarming and post-workload cleanup. Missing or partial historical evidence never becomes an autoscaling claim.
- New `hooks/useTelemetryHistory.ts`: a single six-second history subscription shared across views, retaining timestamped data on errors. Existing three-second summary/control polling remains.
- New `components/DetailSection.tsx`: keyboard-operable native disclosures; closed detailed charts do not mount. No extra polling is created by opening them.
- `components/TelemetryPanels.tsx`: retains all eleven original charts using the shared history; 5/10-minute choice controls primary and detailed views together.
- `components/TimeSeriesChart.tsx`: compact main plots, stepped replica traces, dashed desired line, accessible descriptions and more readable axis labels. Missing-scrape gaps stay visible.
- `components/AppShell.tsx`, `components/LabActivityFeed.tsx`, `styles.css`: concise navigation, skip link, focus states, consistent spacing/color, mobile ordering, correctly attributed activity events. Store business logic is unchanged.
- `tests/controls-render.test.ts` updated; `tests/experiment-presentation.test.ts` added for truthful state/result rendering, known-status gating, workload-window observation and server durations.

### Before / after measurements

Measured from the top of the document after data loaded, with advanced/details closed and the same previous completed run present. Browser scrollbars account for the 15px difference between viewport and content width. Zero horizontal overflow at all three sizes.

| Viewport | CTA before → after | Main telemetry section before → after | Default page height before → after |
|---|---:|---:|---:|
| 1440×900 | 871 → 480px | 1562 → 224px | 4535 → 1382px (69.5% shorter) |
| 1366×768 | 871 → 478px | 1582 → 222px | 4500 → 1370px (69.6% shorter) |
| 390×844 | 1525 → 511px | 3776 → 679px | 8788 → 2369px (73.0% shorter) |

The laptop primary chart pair starts at 520px and ends at 713px, within the initial 768px viewport. There are now zero intervening sections between action and live evidence. Mobile shows the action and initial live values in its first viewport; larger plots follow naturally below. Detailed content is disclosed, not deleted, so opening all diagnostics intentionally increases document height.

Visual evidence is saved at `C:/Users/verma/Desktop/scalelab-ux-review/`: `before-desktop.png`, `before-laptop.png`, `before-mobile.png`, `before-telemetry.png`, `before-bottom.png`, `after-desktop.png`, `after-laptop.png`, `after-mobile.png`, `after-mobile-feedback.png`, `after-bottom.png`, and `layout-measurements.json`. These before/after screenshots use real read-only telemetry. Files prefixed `fixture-` are explicitly synthetic UI acceptance states and are not benchmark evidence.

### Focused refinement after visual review

The first implementation still gave the desktop plots too much vertical space and delayed mobile feedback with explanatory copy. Reduced chart height and intro/panel spacing; on mobile removed the repeated watch-note from the primary path while preserving contextual explanations and technical detail. Retained the important 70% CPU target on mobile. Corrected fractional axis ticks, ensured an already-active workload is identified from the server rather than the visitor's selected preset, and clarified missing-snapshot wording. Final screenshots were inspected again at all requested sizes.

### Accessibility and performance

Verified native disclosure keyboard activation (Enter), visible solid focus outline, accessible control names, initial collapsed states, touch-sized primary controls and navigation, chart descriptions, explicit status/error text and no horizontal overflow. Main color contrast calculations: white/teal CTA 5.47:1; muted heading/white 6.26:1; body text/panel 7.03:1; Ready text/panel 6.87:1; warning text/panel 6.84:1. Existing reduced-motion CSS remains and covers the new disclosure transition. This is not a complete assistive-technology or WCAG conformance audit.

Only two main charts mount by default instead of eleven. Detailed charts unmount when closed; the shared history subscription continues once. No packages, fonts, animation libraries or additional telemetry requests were added. Final frontend build reports JS 292.58kB (88.82kB gzip), CSS 36.29kB (8.31kB gzip). These are build sizes, not Core Web Vitals. LCP/INP/CLS and field performance were not measured.

### Verification results and limits

- Frontend: **16 tests passed**. Includes unknown current-run gating, active shared-run rendering, cleanup/restoration remaining active, stopped/failed labels, matching-result IDs, missing metrics, partial workload history, and duration formatting.
- Lab controller: **38 tests passed**. Existing HTTP handlers, presets, request guards, warm readiness, cancellation, cleanup ordering, restoration and lease recovery remain intact.
- Load generator: **15 tests passed**. Fixed target, internal authorization, resource limits, one active test and bounded results remain intact.
- API benchmark reset unit test: **1 passed**, with mocked pools only. Database-backed API integration tests were not rerun; no API code changed and no database fixture/reset was run against Civo.
- `pnpm typecheck`: all four applications passed. `pnpm --filter @system-design/web build`: passed. `git diff --check`: passed after removing a trailing blank line. Git emits only the repository's LF/CRLF normalization notices.
- Local browser: default selection, alternate preset, Advanced Options preserving selection, unchecked warm/custom defaults, invalid VU budget disabling start, custom mixed 70/30 payload, explicit preset start/stop, warm preparation/cancel, reset feedback, stopped/failed/cleanup states, backend unavailable and empty metrics checked with an isolated localhost fixture. The fixture has no Docker access, forwarding or k6 execution. Its action log confirms only explicit controls issued mutations. It lives outside the repository alongside visual artifacts.
- Read-only live preview: genuine summary/history rendered; 5/10-minute selection and all eleven detailed chart titles verified; closing diagnostics returned to two chart SVGs. `/`, `/scalelab` and `/store` routing verified; the Store rendered its existing empty-catalog state with a correctly shaped isolated response.
- Full live start→scale→stop and real Store checkout are **not newly verified** in this redesign. Existing real API call methods are preserved and controller tests pass; a production smoke is deferred until visual/release approval. No live load test, deployment, image push, Git commit or Git push was performed.
- Comprehension is a design objective, not a measured user-study result. A recruiter usability session and full screen-reader/device audit remain useful follow-ups.

### Ready-to-run release steps — only after approval

The web image is the only image needing a rebuild. No environment-variable or backend changes are required. From the repository root:

```powershell
$webTag = "ux-v1-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
docker build --platform linux/amd64 -f apps/web/Dockerfile -t "verma17/scalelab-web:$webTag" .
docker push "verma17/scalelab-web:$webTag"
```

Update only the web image line in `infrastructure/kubernetes/civo/web.yaml` to that exact new tag, then:

```powershell
kubectl --kubeconfig 'C:\Users\verma\Downloads\civo-scalelab-kubeconfig' --context scalelab -n scalelab apply -f infrastructure/kubernetes/civo/web.yaml
kubectl --kubeconfig 'C:\Users\verma\Downloads\civo-scalelab-kubeconfig' --context scalelab -n scalelab rollout status deployment/scalelab-web --timeout=3m
kubectl --kubeconfig 'C:\Users\verma\Downloads\civo-scalelab-kubeconfig' --context scalelab -n scalelab get pods -l app=scalelab-web
```

Verify the HTTPS root, alias, Store, telemetry and API routing. Run only a separately approved small smoke. Current rollback image remains `verma17/scalelab-web:visitor-v1-20261029-4b7d92c1`; reverting the web manifest's image and applying it restores the previous frontend. Commit/push the reviewed frontend/docs and approved image-tag change only after authorization.
