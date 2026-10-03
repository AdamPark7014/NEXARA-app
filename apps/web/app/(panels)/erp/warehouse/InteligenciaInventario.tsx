"use client";

import { useMemo, type ReactNode } from "react";
import PaidOutlined from "@mui/icons-material/PaidOutlined";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import AutorenewOutlined from "@mui/icons-material/AutorenewOutlined";
import TrendingDownOutlined from "@mui/icons-material/TrendingDownOutlined";
import ReportProblemOutlined from "@mui/icons-material/ReportProblemOutlined";
import HourglassEmptyOutlined from "@mui/icons-material/HourglassEmptyOutlined";
import { Alert, Badge, Button, Card, CardHead, EmptyState, SkeletonRows, Stat, StatRow } from "@/components/base";
import type { InventoryInsights } from "@/lib/stock-api";
import { cantidad, pesos } from "@/lib/recursos-ui";
import s from "./almacen.module.css";

/** Tarjeta del resumen: título, una línea de contexto y su contenido. */
function Bloque({ titulo, subtitulo, children }: { titulo: string; subtitulo: string; children: ReactNode }) {
  return (
    <Card>
      <CardHead title={titulo} subtitle={subtitulo} />
      <div className={s.cuerpoTarjeta}>{children}</div>
    </Card>
  );
}

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
      <Card>
        <EmptyState
          icon={<Inventory2Outlined />}
          title="Aún no hay resumen del inventario"
          description="Aparece en cuanto haya existencias y movimientos registrados."
          action={
            <Button size="sm" variant="secondary" onClick={onRetry}>
              Reintentar
            </Button>
          }
        />
      </Card>
    );
  }

  const { kpis } = insights;

  return (
    <div className={s.resumen} aria-busy={loading}>
      <StatRow ariaLabel="Indicadores del inventario" cols={3}>
        <Stat label="Valor del inventario" value={pesos(kpis.totalValue, { enteros: true })} tone="brand" icon={<PaidOutlined />} />
        <Stat
          label="Productos por almacén"
          value={kpis.skuLocations}
          hint={`${kpis.fillHealthyPct}% con stock sano`}
          icon={<Inventory2Outlined />}
          iconTone="neutral"
        />
        <Stat
          label="Rotación anual"
          value={`${kpis.turnoverAnnualProxy}×`}
          hint="Estimada con las salidas de 30 días"
          icon={<AutorenewOutlined />}
          iconTone="info"
        />
        <Stat
          label="Bajo mínimo"
          value={kpis.lowStock}
          tone={kpis.lowStock ? "warning" : "success"}
          icon={<TrendingDownOutlined />}
          iconTone={kpis.lowStock ? "warning" : "success"}
          semaforo={kpis.lowStock ? "ambar" : "verde"}
        />
        <Stat
          label="Agotados"
          value={kpis.zeroStock}
          tone={kpis.zeroStock ? "danger" : "default"}
          icon={<ReportProblemOutlined />}
          iconTone={kpis.zeroStock ? "danger" : "neutral"}
          semaforo={kpis.zeroStock ? "rojo" : "verde"}
        />
        <Stat
          label="Sin movimiento"
          value={kpis.deadStock}
          hint={pesos(kpis.deadStockValue, { enteros: true })}
          tone={kpis.deadStock ? "warning" : "default"}
          icon={<HourglassEmptyOutlined />}
          iconTone={kpis.deadStock ? "warning" : "neutral"}
        />
      </StatRow>

      {insights.alerts.map((a) => (
        <Alert key={a.message} tone={a.severity === "danger" ? "danger" : "warning"}>
          {a.message}
        </Alert>
      ))}

      <div className={s.rejillaResumen}>
        <Bloque titulo="Entradas y salidas" subtitulo="Unidades, últimos 14 días">
          <div className={s.grafica} role="img" aria-label="Gráfica de entradas y salidas de los últimos 14 días">
            {insights.trends.outflow14d.map((p, i) => {
              const entradas = insights.trends.inflow14d[i]?.qty ?? 0;
              return (
                <div key={p.date} className={s.graficaDia} title={`${p.date}: entraron ${cantidad(entradas)}, salieron ${cantidad(p.qty)}`}>
                  {/* La altura es el dato: es lo único que se calcula en línea. */}
                  <div className={s.barraEntrada} style={{ height: `${(entradas / maxFlujo) * 100}%` }} />
                  <div className={s.barraSalida} style={{ height: `${(p.qty / maxFlujo) * 100}%` }} />
                </div>
              );
            })}
          </div>
          <div className={s.leyenda}>
            <span><span aria-hidden="true" className={s.leyendaEntrada} />Entradas</span>
            <span><span aria-hidden="true" className={s.leyendaSalida} />Salidas</span>
          </div>
        </Bloque>

        <Bloque titulo="Último movimiento" subtitulo="Productos según los días que llevan sin moverse">
          <div className={s.antiguedad}>
            {[
              { label: "0 a 30 días", value: insights.aging.d0_30 },
              { label: "30 a 60 días", value: insights.aging.d30_60 },
              { label: "60 a 90 días", value: insights.aging.d60_90 },
              { label: "Más de 90 días", value: insights.aging.d90_plus },
            ].map((b) => (
              <div key={b.label} className={s.cubeta}>
                <div className={s.tenue}>{b.label}</div>
                <div className={s.cubetaValor}>{b.value}</div>
              </div>
            ))}
          </div>
          <div className={s.insignias} title="Clase A: los que más valor mueven; C: los que menos">
            <Badge tone="brand">Clase A: {kpis.abcA}</Badge>
            <Badge tone="neutral">Clase B: {kpis.abcB}</Badge>
            <Badge tone="warning">Clase C: {kpis.abcC}</Badge>
          </div>
        </Bloque>

        <Bloque titulo="Los que más salen" subtitulo="Despachos de los últimos 30 días">
          {insights.topMovers.length ? (
            <ul className={s.lista}>
              {insights.topMovers.map((m) => (
                <li key={m.productId} className={s.listaFila}>
                  <span className={s.doble}>
                    <span className={s.fuerte}>{m.name}</span>
                    <span className={s.tenue}>{m.sku}</span>
                  </span>
                  <span className={`${s.doble} ${s.derecha}`}>
                    <span className={s.cifra}>{cantidad(m.dispatched30d)}</span>
                    <span className={s.tenue}>{m.daysOfCover != null ? `alcanza ${m.daysOfCover} días` : "sin consumo"}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={s.textoVacio}>Nada salió en los últimos 30 días.</p>
          )}
        </Bloque>

        <Bloque titulo="Qué conviene pedir" subtitulo="Según el mínimo y el máximo de cada producto">
          {insights.reorderSuggestions.length ? (
            <ul className={s.lista}>
              {insights.reorderSuggestions.map((r) => (
                <li key={`${r.productId}-${r.warehouse}`} className={s.listaFila}>
                  <span className={s.doble}>
                    <span className={s.fuerte}>{r.name}</span>
                    <span className={s.tenue}>
                      {r.warehouse} · hay {cantidad(r.onHand)} · aprox. {pesos(r.estimatedCost, { enteros: true })}
                    </span>
                  </span>
                  <span className={s.cifra}>+{cantidad(r.suggestedQty)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={s.textoVacio}>Nada que pedir: el stock está sano.</p>
          )}
        </Bloque>

        <Bloque titulo="Productos quietos" subtitulo="Los que más tiempo llevan sin moverse">
          {insights.slowMovers.length ? (
            <ul className={s.lista}>
              {insights.slowMovers.map((m) => (
                <li key={m.productId} className={s.listaFila}>
                  <span className={s.fuerte}>{m.name}</span>
                  <span className={s.tenueNum}>
                    {m.idleDays != null ? `${m.idleDays} días` : "nunca se ha movido"} · {pesos(m.value, { enteros: true })}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={s.textoVacio}>Todo se ha movido recientemente.</p>
          )}
        </Bloque>

        <Bloque titulo="Por almacén" subtitulo="Valor y productos bajo mínimo">
          <div className={s.existencias}>
            {insights.byWarehouse.map((w) => (
              <div key={w.name} className={s.almacenFila}>
                <span className={s.fuerte}>{w.name}</span>
                <span className={s.num}>{pesos(w.value, { enteros: true })}</span>
                <Badge tone={w.low ? "warning" : "success"} size="sm" dot>
                  {w.low ? `${w.low} bajo mínimo` : "Sin alertas"}
                </Badge>
              </div>
            ))}
          </div>
        </Bloque>
      </div>
    </div>
  );
}
