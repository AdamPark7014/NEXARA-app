"use client";

import { useEffect, useState } from "react";
import { MesaPagina } from "@/components/mesa-contable/MesaPagina";
import { erpFetch, formatApiError } from "@/lib/erp-api";
import { useUser } from "@/components/UserContext";
import CrossPanelLink from "@/components/CrossPanelLink";

type Item = { id: string; etiqueta: string; hecho: number; total: number; href: string };
type Tablero = { avancePct: number; items: Item[] };

export default function MiCierrePage() {
  const { token } = useUser();
  const [data, setData] = useState<Tablero | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    erpFetch<Tablero>("accounting/buzon-sat/mi-cierre", token)
      .then(setData)
      .catch((e) => setError(formatApiError(e)));
  }, [token]);

  return (
    <MesaPagina titulo="Mi cierre" descripcion="Avance del cierre contable de Paulina: bancos, CFDI, REP, DIOT y EFOS.">
      {error ? <p role="alert">{error}</p> : null}
      {!data ? (
        <p>Cargando…</p>
      ) : (
        <div style={{ maxWidth: 640 }}>
          <p style={{ fontSize: 28, fontWeight: 700 }}>{data.avancePct}%</p>
          <div style={{ height: 10, background: "#e5e7eb", borderRadius: 6, marginBottom: 24 }}>
            <div style={{ width: `${data.avancePct}%`, height: "100%", background: "#168570", borderRadius: 6 }} />
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {data.items.map((i) => (
              <li key={i.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: "1px solid #e5e7eb" }}>
                <CrossPanelLink href={i.href}>{i.etiqueta}</CrossPanelLink>
                <span>
                  {i.hecho}/{i.total}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </MesaPagina>
  );
}