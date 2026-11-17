"use client";

import { useState } from "react";
import { erpFetch, formatApiError } from "@/lib/erp-api";
import { useUser } from "@/components/UserContext";
import { toast } from "@/components/Toast";

/**
 * Botón «Armar con IA»: propone un borrador de factura editable.
 * No timbra: solo muestra el JSON del borrador para que la contadora lo revise.
 */
export function ArmarFacturaIA({ onBorrador }: { onBorrador?: (b: unknown) => void }) {
  const { token } = useUser();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [cargando, setCargando] = useState(false);
  const [borrador, setBorrador] = useState<unknown>(null);

  async function armar() {
    if (!token) return;
    setCargando(true);
    try {
      const r = await erpFetch<{ borrador: unknown; mensaje: string }>("accounting/buzon-sat/armar-factura", token, {
        method: "POST",
        body: JSON.stringify({ texto }),
      });
      setBorrador(r.borrador);
      onBorrador?.(r.borrador);
      toast.success(r.mensaje);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setCargando(false);
    }
  }

  return (
    <div>
      <button type="button" style={{ minHeight: 40 }} onClick={() => setAbierto((v) => !v)}>
        Armar con IA
      </button>
      {abierto ? (
        <div style={{ marginTop: 12, display: "grid", gap: 8, maxWidth: 560 }}>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={6}
            placeholder="Pega el texto de la OC, cotización o notas. También puedes indicar el id de cotización en el API."
            style={{ fontSize: 16, minHeight: 120, width: "100%" }}
          />
          <button type="button" style={{ minHeight: 40 }} disabled={cargando || !texto.trim()} onClick={() => void armar()}>
            {cargando ? "Armando…" : "Proponer borrador"}
          </button>
          {borrador ? (
            <pre style={{ fontSize: 12, overflow: "auto", maxHeight: 320, background: "#f8fafc", padding: 12 }}>
              {JSON.stringify(borrador, null, 2)}
            </pre>
          ) : null}
          <p style={{ fontSize: 12, color: "#5b6272", margin: 0 }}>
            Cada campo viene marcado como propuesta de IA. Nada se timbra hasta que uses Timbrar en el editor de factura.
          </p>
        </div>
      ) : null}
    </div>
  );
}
