import { context, metrics, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
  type ReadableSpan,
} from "@opentelemetry/sdk-trace-base";

export interface TestTelemetry {
  spans(): ReadableSpan[];
  span(name: string): ReadableSpan;
  metricNames(): Promise<string[]>;
  reset(): void;
}

/** Registers in-memory trace and metric pipelines as the global OpenTelemetry providers. */
export function installTestTelemetry(): TestTelemetry {
  trace.disable();
  metrics.disable();
  context.disable();

  const spanExporter = new InMemorySpanExporter();
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  trace.setGlobalTracerProvider(
    new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(spanExporter)] }),
  );

  const reader = new PeriodicExportingMetricReader({
    exporter: new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE),
    exportIntervalMillis: 60 * 60 * 1000,
  });
  metrics.setGlobalMeterProvider(new MeterProvider({ readers: [reader] }));

  const spans = () => spanExporter.getFinishedSpans();
  return {
    spans,
    span: (name) => {
      const found = spans().find((span) => span.name === name);
      if (!found) throw new Error(`span ${name} not found`);
      return found;
    },
    metricNames: async () => {
      const { resourceMetrics } = await reader.collect();
      return resourceMetrics.scopeMetrics.flatMap((scope) =>
        scope.metrics.map((metric) => metric.descriptor.name),
      );
    },
    reset: () => spanExporter.reset(),
  };
}

/** Every attribute value of every span, flattened to strings, for no-text assertions. */
export function allAttributeValues(spans: ReadableSpan[]): string[] {
  return spans.flatMap((span) =>
    Object.values(span.attributes).flatMap((value) =>
      Array.isArray(value) ? value.map(String) : [String(value)],
    ),
  );
}
