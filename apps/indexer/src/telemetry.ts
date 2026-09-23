import { AzureFunctionsInstrumentation } from "@azure/functions-opentelemetry-instrumentation";
import { useAzureMonitor } from "@azure/monitor-opentelemetry";
import { logs } from "@opentelemetry/api-logs";
import { metrics, trace } from "@opentelemetry/api";
import { registerInstrumentations } from "@opentelemetry/instrumentation";

export const SERVICE_NAME = "ingestion-indexer";

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
      instrumentations: [new AzureFunctionsInstrumentation()],
    }),
};

/**
 * Exports traces, metrics and logs to the same Application Insights resource as the API, under its
 * own service name, so one workspace shows the question path and the ingestion path.
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
