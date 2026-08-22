"use client";

import { useEffect, useState } from "react";
import { Money } from "@/components/ui/DataTable";
import { smartQuoteSupplierStats, type SupplierStatsResponse } from "@/lib/smart-quote-api";
import styles from "./quote-supplier.module.css";

type Props = {
  token: string;
  from?: string;
  to?: string;
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

  if (loading || !stats?.suppliers?.length) return null;

  return (
    <div className={styles.statsBar}>
      <div className={styles.statsHead}>
        <div>
          <h3 className={styles.statsTitle}>Economía por mayorista</h3>
          <p className={styles.statsSub}>
            Costo proveedor vs venta neta · IVA según política de cada fuente
          </p>
        </div>
        <div style={{ textAlign: "right", fontSize: 12, color: "var(--text-secondary)" }}>
          <div>
            Margen global: <strong>{stats.totals.marginPercent}%</strong>
          </div>
          <div>
            Venta c/IVA: <Money value={stats.totals.sellWithTax} />
          </div>
        </div>
      </div>
      <div className={styles.statsGrid}>
        {stats.suppliers.map((s) => (
          <div key={s.supplierCode} className={styles.statCard}>
            <div className={styles.statLabel}>
              {s.quoteCount} cotiz. · {s.lineCount} partidas
            </div>
            <div className={styles.statSupplier}>{s.label}</div>
            <div className={styles.statRow}>
              <span>Costo</span>
              <Money value={s.costNet} />
            </div>
            <div className={styles.statRow}>
              <span>Venta neta</span>
              <Money value={s.sellNet} />
            </div>
            <div className={styles.statRow}>
              <span>Margen</span>
              <span>
                <Money value={s.marginAmount} /> ({s.marginPercent}%)
              </span>
            </div>
            <div className={styles.statIva}>
              IVA {s.customerTaxPercent}% · lista {s.priceIncludesTax ? "con IVA" : "sin IVA"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
