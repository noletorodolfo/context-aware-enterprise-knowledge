// Bundle entry point: telemetry first, then importing each function module registers it with the
// Functions host.
import "./register-telemetry.js";
import "./functions/webhook.js";
import "./functions/process.js";
import "./functions/renew.js";
