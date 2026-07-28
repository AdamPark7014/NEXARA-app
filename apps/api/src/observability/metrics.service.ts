import { Injectable, Logger } from '@nestjs/common';

export type MetricLabels = Record<string, string | number | boolean | undefined>;

/**
 * In-process Prometheus-style metrics registry.
 * Expose via GET /metrics (text) and structured JSON for dashboards.
 * Swap for OpenTelemetry MeterProvider when OTEL_EXPORTER_OTLP_ENDPOINT is set.
 */
@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  private readonly counters = new Map<string, number>();
  private readonly gauges = new Map<string, number>();
  private readonly histograms = new Map<string, number[]>();
  private readonly startedAt = Date.now();

  inc(name: string, by = 1, labels?: MetricLabels) {
    const key = this.key(name, labels);
    this.counters.set(key, (this.counters.get(key) || 0) + by);
  }

  setGauge(name: string, value: number, labels?: MetricLabels) {
    this.gauges.set(this.key(name, labels), value);
  }

  observe(name: string, valueMs: number, labels?: MetricLabels) {
    const key = this.key(name, labels);
    const arr = this.histograms.get(key) || [];
    arr.push(valueMs);
    if (arr.length > 500) arr.shift();
    this.histograms.set(key, arr);
  }

  snapshot() {
    const hist: Record<string, { count: number; p50: number; p95: number; avg: number }> = {};
    for (const [k, values] of this.histograms.entries()) {
      const sorted = [...values].sort((a, b) => a - b);
      const avg = values.reduce((s, v) => s + v, 0) / (values.length || 1);
      hist[k] = {
        count: values.length,
        p50: sorted[Math.floor(sorted.length * 0.5)] || 0,
        p95: sorted[Math.floor(sorted.length * 0.95)] || 0,
        avg: Math.round(avg * 100) / 100,
      };
    }
    return {
      uptimeSec: Math.floor((Date.now() - this.startedAt) / 1000),
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      histograms: hist,
    };
  }

  toPrometheus(): string {
    const lines: string[] = [];
    for (const [k, v] of this.counters) {
      lines.push(`# TYPE ${this.baseName(k)} counter`);
      lines.push(`${k} ${v}`);
    }
    for (const [k, v] of this.gauges) {
      lines.push(`# TYPE ${this.baseName(k)} gauge`);
      lines.push(`${k} ${v}`);
    }
    return lines.join('\n') + '\n';
  }

  recordHttp(method: string, route: string, status: number, durationMs: number) {
    this.inc('http_requests_total', 1, { method, route, status });
    this.observe('http_request_duration_ms', durationMs, { method, route });
    if (status >= 500) this.inc('http_errors_total', 1, { method, route });
  }

  private key(name: string, labels?: MetricLabels) {
    if (!labels || !Object.keys(labels).length) return name;
    const parts = Object.entries(labels)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}="${String(v)}"`)
      .join(',');
    return `${name}{${parts}}`;
  }

  private baseName(keyed: string) {
    const i = keyed.indexOf('{');
    return i >= 0 ? keyed.slice(0, i) : keyed;
  }
}
