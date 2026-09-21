"use client";

import { useEffect, useState } from "react";
import Section from "@/components/ui/Section";
import { Money } from "@/components/ui/DataTable";
import { smartQuoteSupplierStats, type SupplierStatsResponse } from "@/lib/smart-quote-api";

type Props = {
  token: string;
  from?: string;
  to?: string;
};

/**
 * Economía por mayorista.
 *
 * Era un panel con degradado que dentro llevaba una tarjeta por proveedor, y
 * cada tarjeta un bloque de filas: tres niveles de caja para cinco números.
 * Ahora es una tabla densa dentro de la sección, sin caja propia: los montos
 * a la derecha en cifras de ancho fijo, y el contexto (cuántas cotizaciones,
 * qué IVA aplica esa fuente) en gris bajo el nombre.
 */

const CELL: React.CSSProperties = {
  padding: "9px 10px",
  borderBottom: "1px solid var(--border)",
  verticalAlign: "top",
};

const NUM: React.CSSProperties = {
  ...CELL,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
};

const META: React.CSSProperties = { fontSize: 11.5, color: "var(--text-tertiary)", lineHeight: 1.45 };

const HEAD: React.CSSProperties = {
  padding: "0 10px 6px",
  fontSize: 11.5,
  fontWeight: 600,
  color: "var(--text-secondary)",
  borderBottom: "1px solid var(--border)",
  whiteSpace: "nowrap",
};

export default function SupplierStatsBar({ token, from, to }: Props) {
  const [stats, setStats] = useState<SupplierStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    smartQuoteSupplierStats(token, { from, to })
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, [token, from, to]);

  // Sin una sola partida de mayorista en el periodo, la tabla serían ceros.
  if (loading || !stats?.suppliers?.length) return null;

  return (
    <Section
      title="Economía por mayorista"
      subtitle={`Margen global ${stats.totals.marginPercent}% · venta con IVA incluido`}
    >
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            <th scope="col" style={{ ...HEAD, textAlign: "left" }}>
              Mayorista
            </th>
            <th scope="col" style={{ ...HEAD, textAlign: "right", width: 120 }}>
              Venta neta
            </th>
            <th scope="col" style={{ ...HEAD, textAlign: "right", width: 120 }}>
              Margen
            </th>
          </tr>
        </thead>
        <tbody>
          {stats.suppliers.map((s) => (
            <tr key={s.supplierCode}>
              <td style={CELL}>
                <div style={{ fontWeight: 600 }}>{s.label}</div>
                <div style={META}>
                  {s.quoteCount} cotización{s.quoteCount === 1 ? "" : "es"} · {s.lineCount} partidas · costo{" "}
                  <Money value={s.costNet} />
                </div>
                <div style={META}>
                  IVA {s.customerTaxPercent}% · lista {s.priceIncludesTax ? "con IVA" : "sin IVA"}
                </div>
              </td>
              <td style={NUM}>
                <Money value={s.sellNet} />
              </td>
              <td style={NUM}>
                <div>{s.marginPercent}%</div>
                <div style={META}>
                  <Money value={s.marginAmount} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td style={{ ...CELL, borderBottom: "none", fontWeight: 600 }}>
              Total
              <div style={META}>
                venta con IVA <Money value={stats.totals.sellWithTax} />
              </div>
            </td>
            <td style={{ ...NUM, borderBottom: "none", fontWeight: 600 }}>
              <Money value={stats.totals.sellNet} />
            </td>
            <td style={{ ...NUM, borderBottom: "none", fontWeight: 600 }}>
              <div>{stats.totals.marginPercent}%</div>
              <div style={META}>
                <Money value={stats.totals.marginAmount} />
              </div>
            </td>
          </tr>
        </tfoot>
      </table>
    </Section>
  );
}
