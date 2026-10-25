"use client";

import { useState } from "react";
import type { EstadoPermiso } from "@/lib/use-permiso-microfono";

/**
 * Tarjeta del permiso del micrófono, con el mismo estilo que la de notificaciones
 * (`components/WebPushConsentBanner.tsx`): explica para qué es y el botón principal abre el aviso
 * del navegador en ese toque. Si se negó, explica cómo volver a permitirlo.
 */
export default function PermisoMicrofono({
  estado,
  onPermitir,
  onReconsultar,
  onCerrar,
}: {
  estado: Extract<EstadoPermiso, "prompt" | "denied">;
  /** Llama a `getUserMedia` en este mismo toque (y, si había una grabación esperando, la arranca). */
  onPermitir: () => Promise<void>;
  /** «Ya lo permití»: vuelve a consultar el permiso. */
  onReconsultar: () => Promise<void>;
  onCerrar: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const negado = estado === "denied";
  const correr = (fn: () => Promise<void>) => async () => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-labelledby="nexara-mic-titulo"
      aria-describedby="nexara-mic-desc"
      style={{
        position: "fixed",
        bottom: 16,
        left: 16,
        right: 16,
        maxWidth: 480,
        margin: "0 auto",
        zIndex: 99998,
        padding: "14px 16px",
        borderRadius: 12,
        background: "var(--surface, #fff)",
        border: "1px solid var(--border, #e2e8f0)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
        fontSize: 14,
      }}
    >
      <strong id="nexara-mic-titulo" style={{ display: "block", marginBottom: 8 }}>
        {negado ? "El micrófono está bloqueado para NEXARA" : "NEXARA necesita tu micrófono para grabar la reunión y tomar la minuta"}
      </strong>
      <div id="nexara-mic-desc" style={{ margin: "0 0 12px", color: "var(--text-secondary, #64748b)", lineHeight: 1.5 }}>
        {negado ? (
          <>
            <p style={{ margin: "0 0 6px" }}>Para volver a permitirlo:</p>
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              <li>Toca el candado (o el ícono de ajustes) junto a la dirección de la página.</li>
              <li>En «Micrófono», elige «Permitir». En Safari: Safari › Ajustes para este sitio web › Micrófono › Permitir.</li>
              <li>Recarga la página y toca «Ya lo permití».</li>
            </ol>
          </>
        ) : (
          <p style={{ margin: 0 }}>El audio se transcribe en el servidor y se borra al terminar.</p>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn-primary"
          disabled={busy}
          style={{ padding: "8px 14px", borderRadius: 8, fontWeight: 600, cursor: busy ? "wait" : "pointer" }}
          onClick={correr(negado ? onReconsultar : onPermitir)}
        >
          {busy ? (negado ? "Revisando…" : "Abriendo permiso…") : negado ? "Ya lo permití" : "Permitir micrófono"}
        </button>
        <button
          type="button"
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            cursor: "pointer",
            background: "transparent",
            border: "1px solid var(--border, #cbd5e1)",
          }}
          onClick={onCerrar}
        >
          Ahora no
        </button>
      </div>
    </div>
  );
}
