import { describe, expect, it, vi } from "vitest";
import { initTelemetry, type TelemetryHooks } from "./telemetry.js";

const hooks = () => {
  const useAzureMonitor = vi.fn();
  const registerFunctionsInstrumentation = vi.fn();
  return {
    useAzureMonitor,
    registerFunctionsInstrumentation,
    hooks: { useAzureMonitor, registerFunctionsInstrumentation } as TelemetryHooks,
  };
};

describe("initTelemetry", () => {
  it("is a no-op without an Application Insights connection string", () => {
    const h = hooks();
    expect(initTelemetry({}, h.hooks)).toBe(false);
    expect(h.useAzureMonitor).not.toHaveBeenCalled();
    expect(h.registerFunctionsInstrumentation).not.toHaveBeenCalled();
  });

  it("exports to Azure Monitor and instruments the Functions invocations", () => {
    const h = hooks();
    const env: Record<string, string | undefined> = {
      APPLICATIONINSIGHTS_CONNECTION_STRING:
        "InstrumentationKey=00000000-0000-0000-0000-000000000000",
    };
    expect(initTelemetry(env, h.hooks)).toBe(true);
    expect(h.useAzureMonitor).toHaveBeenCalledWith({
      azureMonitorExporterOptions: {
        connectionString: "InstrumentationKey=00000000-0000-0000-0000-000000000000",
      },
      enableLiveMetrics: false,
    });
    expect(h.registerFunctionsInstrumentation).toHaveBeenCalledOnce();
    expect(env.OTEL_SERVICE_NAME).toBe("knowledge-api");
  });
});
