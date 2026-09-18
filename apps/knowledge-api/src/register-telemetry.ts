// Imported first by main.ts so instrumentation is in place before any other module loads.
import { initTelemetry } from "./telemetry.js";

initTelemetry(process.env);
