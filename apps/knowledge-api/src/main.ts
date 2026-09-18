// Bundle entry point: telemetry first, then importing a function module registers it with the
// Functions host.
import "./register-telemetry.js";
import "./functions/ask.js";
