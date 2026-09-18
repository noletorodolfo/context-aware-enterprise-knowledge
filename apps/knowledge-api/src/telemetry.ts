import { AzureFunctionsInstrumentation } from "@azure/functions-opentelemetry-instrumentation";
import { useAzureMonitor } from "@azure/monitor-opentelemetry";
import { logs } from "@opentelemetry/api-logs";
import { metrics, trace } from "@opentelemetry/api";
import { registerInstrumentations } from "@opentelemetry/instrumentation";

export const SERVICE_NAME = "knowledge-api";

export interface TelemetryHooks {
  useAzureMonitor: typeof useAzureMonitor;
  registerFunctionsInstrumentation: () => void;
}

const defaultHooks: TelemetryHooks = {
  useAzureMonitor,
  registerFunctionsInstrumentation: () =>
    registerInstrumentations({
      tracerProvider: trace.getTracerProvider(),
      meterProvider: metrics.getMeterProvider(),
      loggerProvider: logs.getLoggerProvider(),
      // Continues the host's trace (itself continuing the SPFx traceparent) in each invocation.
      instrumentations: [new AzureFunctionsInstrumentation()],
    }),
};

/**
 * Exports traces, metrics and logs to Application Insights. Without a connection string
 * (tests, local runs) nothing is registered and the OpenTelemetry API stays a no-op.
 * Returns whether telemetry was enabled.
 */
export function initTelemetry(
  env: Record<string, string | undefined>,
  hooks: TelemetryHooks = defaultHooks,
): boolean {
  const connectionString = env.APPLICATIONINSIGHTS_CONNECTION_STRING;
  if (!connectionString) return false;
  env.OTEL_SERVICE_NAME ??= SERVICE_NAME;
  hooks.useAzureMonitor({
    azureMonitorExporterOptions: { connectionString },
    enableLiveMetrics: false,
  });
  hooks.registerFunctionsInstrumentation();
  return true;
}
