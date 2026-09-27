"use client";

import { useMemo } from "react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import InlineAlert from "@/components/ui/InlineAlert";
import { Tag } from "@/components/ui/DataTable";
import { SkeletonRows } from "@/components/base";
import { DashGrid, DashCol, DashPanel, StatStrip, DashPill } from "@/components/dashboard/DashKit";
import type { InventoryInsights } from "@/lib/stock-api";
import { cantidad, pesos } from "@/lib/recursos-ui";

const listaScroll = { display: "flex", flexDirection: "column", gap: 8, maxHeight: 220, overflowY: "auto" } as const;
const tenue = { fontSize: 11, color: "var(--text-tertiary)" } as const;

/** Resumen del inventario: valor, rotación, qué pedir y qué no se mueve. */
export default function InteligenciaInventario({
  insights,
  loading,
  onRetry,
}: {
  insights: InventoryInsights | null;
  loading: boolean;
  onRetry: () => void;
}) {
  const maxFlujo = useMemo(() => {
    if (!insights) return 1;
    return Math.max(
      1,
      ...insights.trends.outflow14d.map((x) => x.qty),
      ...insights.trends.inflow14d.map((x) => x.qty),
    );
  }, [insights]);

  if (loading && !insights) return <SkeletonRows rows={6} label="Calculando el resumen del inventario" />;

  if (!insights) {
    return (
      <EmptyState
        title="Aún no hay resumen del inventario"
        description="Aparece en cuanto haya existencias y movimientos registrados."
        action={
          <Button size="sm" variant="secondary" onClick={onRetry}>
            Reintentar
          </Button>
        }
      />
    );
  }

  const { kpis } = insights;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }} aria-busy={loading}>
      <StatStrip
        stats={[
          { label: "Valor del inventario", value: pesos(kpis.totalValue, { enteros: true }), big: true },
          { label: "Productos por almacén", value: kpis.skuLocations, sub: `${kpis.fillHealthyPct}% con stock sano` },
          {
            label: "Rotación anual",
            value: `${kpis.turnoverAnnualProxy}×`,
            sub: "Estimada con las salidas de 30 días",
            tone: "accent",
          },
          { label: "Bajo mínimo", value: kpis.lowStock, tone: kpis.lowStock ? "warning" : "positive" },
          { label: "Agotados", value: kpis.zeroStock, tone: kpis.zeroStock ? "danger" : "default" },
          {
            label: "Sin movimiento",
            value: kpis.deadStock,
            sub: pesos(kpis.deadStockValue, { enteros: true }),
            tone: kpis.deadStock ? "warning" : "default",
          },
        ]}
      />

      {insights.alerts.map((a) => (
        <InlineAlert key={a.message} variant={a.severity === "danger" ? "danger" : "warning"} message={a.message} />
      ))}

      <DashGrid>
        <DashCol span={6}>
          <DashPanel title="Entradas y salidas" subtitle="Unidades, últimos 14 días">
            <div
              style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 80 }}
              role="img"
              aria-label="Gráfica de entradas y salidas de los últimos 14 días"
            >
              {insights.trends.outflow14d.map((p, i) => {
                const entradas = insights.trends.inflow14d[i]?.qty ?? 0;
                return (
                  <div
                    key={p.date}
                    style={{ flex: 1, display: "flex", gap: 1, alignItems: "flex-end" }}
                    title={`${p.date}: entraron ${cantidad(entradas)}, salieron ${cantidad(p.qty)}`}
                  >
                    <div style={{ flex: 1, height: `${Math.max(2, (entradas / maxFlujo) * 70)}px`, background: "var(--success)", borderRadius: 2, opacity: 0.85 }} />
                    <div style={{ flex: 1, height: `${Math.max(2, (p.qty / maxFlujo) * 70)}px`, background: "var(--primary)", borderRadius: 2 }} />
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 12, ...tenue }}>
              <span><span aria-hidden style={{ color: "var(--success)" }}>■</span> Entradas</span>
              <span><span aria-hidden style={{ color: "var(--primary)" }}>■</span> Salidas</span>
            </div>
          </DashPanel>
        </DashCol>

        <DashCol span={6}>
          <DashPanel title="Último movimiento" subtitle="Productos según los días que llevan sin moverse">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                { label: "0 a 30 días", value: insights.aging.d0_30 },
                { label: "30 a 60 días", value: insights.aging.d30_60 },
                { label: "60 a 90 días", value: insights.aging.d60_90 },
                { label: "Más de 90 días", value: insights.aging.d90_plus },
              ].map((b) => (
                <div key={b.label} style={{ padding: 12, borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                  <div style={tenue}>{b.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{b.value}</div>
                </div>
              ))}
            </div>
            <div
              style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}
              title="Clase A: los que más valor mueven; C: los que menos"
            >
              <DashPill tone="accent">Clase A: {kpis.abcA}</DashPill>
              <DashPill tone="neutral">Clase B: {kpis.abcB}</DashPill>
              <DashPill tone="warning">Clase C: {kpis.abcC}</DashPill>
            </div>
          </DashPanel>
        </DashCol>

        <DashCol span={6}>
          <DashPanel title="Los que más salen" subtitle="Despachos de los últimos 30 días">
            <div style={listaScroll}>
              {insights.topMovers.map((m) => (
                <div key={m.productId} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5 }}>
                  <div style={{ minWidth: 0 }}>
                    <strong>{m.name}</strong>
                    <div style={tenue}>{m.sku}</div>
                  </div>
                  <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    <div style={{ fontWeight: 700 }}>{cantidad(m.dispatched30d)}</div>
                    <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>
                      {m.daysOfCover != null ? `alcanza ${m.daysOfCover} días` : "sin consumo"}
                    </div>
                  </div>
                </div>
              ))}
              {!insights.topMovers.length && <span style={tenue}>Nada salió en los últimos 30 días.</span>}
            </div>
          </DashPanel>
        </DashCol>

        <DashCol span={6}>
          <DashPanel title="Qué conviene pedir" subtitle="Según el mínimo y el máximo de cada producto">
            <div style={listaScroll}>
              {insights.reorderSuggestions.map((r) => (
                <div key={`${r.productId}-${r.warehouse}`} style={{ fontSize: 12.5, borderBottom: "1px solid var(--border)", paddingBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <strong>{r.name}</strong>
                    <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>+{cantidad(r.suggestedQty)}</span>
                  </div>
                  <div style={tenue}>
                    {r.warehouse} · hay {cantidad(r.onHand)} · aprox. {pesos(r.estimatedCost, { enteros: true })}
                  </div>
                </div>
              ))}
              {!insights.reorderSuggestions.length && <span style={tenue}>Nada que pedir: el stock está sano.</span>}
            </div>
          </DashPanel>
        </DashCol>

        <DashCol span={6}>
          <DashPanel title="Productos quietos" subtitle="Los que más tiempo llevan sin moverse">
            <div style={{ ...listaScroll, maxHeight: 180 }}>
              {insights.slowMovers.map((m) => (
                <div key={m.productId} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5 }}>
                  <span>{m.name}</span>
                  <span style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    {m.idleDays != null ? `${m.idleDays} días` : "nunca se ha movido"} · {pesos(m.value, { enteros: true })}
                  </span>
                </div>
              ))}
              {!insights.slowMovers.length && <span style={tenue}>Todo se ha movido recientemente.</span>}
            </div>
          </DashPanel>
        </DashCol>

        <DashCol span={6}>
          <DashPanel title="Por almacén" subtitle="Valor y productos bajo mínimo">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {insights.byWarehouse.map((w) => (
                <div key={w.name} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, fontSize: 12.5, alignItems: "center" }}>
                  <span>{w.name}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{pesos(w.value, { enteros: true })}</span>
                  <Tag variant={w.low ? "warning" : "positive"}>{w.low ? `${w.low} bajo mínimo` : "Sin alertas"}</Tag>
                </div>
              ))}
            </div>
          </DashPanel>
        </DashCol>
      </DashGrid>
    </div>
  );
}
