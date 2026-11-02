"use client";

import { useState } from "react";
import { Button } from "@/components/base";
import { formatApiError } from "@/lib/erp-api";
import { marcarEnviada, MEDIOS_ENVIO, type MedioEnvio } from "@/lib/cotizaciones-api";
import styles from "./editor.module.css";

/**
 * «Ya la envié»: un toque para decir cómo salió. Casi todas las cotizaciones salen por WhatsApp o por
 * fuera, y sin este dato no arrancan el seguimiento, el aviso de por vencer ni el avance de la
 * actividad (Programa Velocidad Core, 01-11-2026).
 */
export default function YaLaEnvie({
  id,
  token,
  faltas,
  alEnviar,
  onError,
}: {
  id: number;
  token: string;
  /** Lo que le falta para poder salir (cliente, partidas). */
  faltas: string[];
  alEnviar: (folio: string) => void;
  onError: (mensaje: string) => void;
}) {
  const [enviando, setEnviando] = useState<MedioEnvio | null>(null);

  const marcar = async (medio: MedioEnvio) => {
    setEnviando(medio);
    try {
      const r = await marcarEnviada(token, id, medio);
      alEnviar(r.quoteNumber);
    } catch (e) {
      onError(formatApiError(e, "No se pudo marcar como enviada."));
    } finally {
      setEnviando(null);
    }
  };

  return (
    <section className={styles.yaLaEnvie} aria-label="Marcar la cotización como enviada">
      <div className={styles.yaLaEnvieTexto}>
        <strong>¿Ya la enviaste?</strong>
        <span>
          {faltas.length
            ? `Antes falta ${faltas.join(" y ")}.`
            : "Dinos cómo salió. Con eso le damos seguimiento y te avisamos antes de que venza."}
        </span>
      </div>
      <div className={styles.yaLaEnvieBotones}>
        {MEDIOS_ENVIO.map((m) => (
          <Button
            key={m.id}
            size="sm"
            variant="secondary"
            disabled={faltas.length > 0 || enviando != null}
            loading={enviando === m.id}
            onClick={() => void marcar(m.id)}
          >
            {m.label}
          </Button>
        ))}
      </div>
    </section>
  );
}
