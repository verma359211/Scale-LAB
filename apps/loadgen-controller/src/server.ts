import { createApp } from "./app.js";
import { config } from "./config.js";
import { K6RunManager } from "./runner.js";

const manager = new K6RunManager({
  targetUrl: config.targetUrl,
  k6Image: config.k6Image,
  loadTestsDirectory: config.loadTestsDirectory,
  resourceLimits: config.resourceLimits,
}, config.cooldownSeconds);

createApp(manager, config.controlToken).listen(config.port, () => {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    service: "loadgen-controller",
    event: "started",
    port: config.port,
  }));
});
