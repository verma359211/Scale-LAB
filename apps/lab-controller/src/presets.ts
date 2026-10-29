import type { RunRequest } from "./run-schema.js";

// Served to the browser and resolved again on start; descriptions and execution
// settings share one definition instead of duplicating a frontend preset table.
export const presets = [
  // 150s leaves several HPA sampling/readiness windows; scaling is observed, not guaranteed.
  { id: "autoscaling", name: "Watch Kubernetes Autoscaling", description: "Gradually increase traffic and watch Kubernetes prepare additional API pods.", observe: "CPU demand, desired replicas, readiness and traffic redistribution in the API replica chart.", profile: "1,000 → 1,600 → 2,400 → 3,200 → 4,000 RPS; about 29 seconds per plateau.", warmup: "Start with normal autoscaling. Warm pods can hide the scale-up effect.", configuration: { type: "ramp", targetRps: 4_000, duration: "150s" } },
  { id: "spike", name: "Traffic Spike", description: "Send a sudden burst of traffic and observe how the backend responds.", observe: "Latency, errors and how quickly additional capacity becomes ready.", profile: "400 RPS → 4,000 RPS → 400 RPS, with 1-second transitions.", warmup: "Normal autoscaling shows the response to an unexpected burst.", configuration: { type: "spike", targetRps: 4_000, duration: "75s" } },
  { id: "throughput", name: "High Throughput", description: "Sustain product reads and benchmark order writes against the ecommerce backend.", observe: "Achieved throughput, successful orders, database waiting and tail latency.", profile: "4,000 target RPS for 90 seconds · 70% reads / 30% writes.", warmup: "Optional warm-start prepares capacity first. Benchmark inventory is cleaned automatically.", configuration: { type: "mixed", targetRps: 4_000, duration: "90s", readPercent: 70, writePercent: 30 } },
] satisfies Array<{ id: string; name: string; description: string; observe: string; profile: string; warmup: string; configuration: RunRequest }>;
