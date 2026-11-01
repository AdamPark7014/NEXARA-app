"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Field, Textarea } from "@/components/base";
import { formatApiError } from "@/lib/erp-api";
import Button from "./Button";
import InlineAlert from "./InlineAlert";
import Modal from "./Modal";

export type PedirTextoEstado = {
  titulo: string;
  etiqueta: string;
  /** Línea de apoyo bajo el título. */
  descripcion?: string;
  placeholder?: string;
  confirmar: string;
  /** Texto del que se parte, por ejemplo al editar. */
  inicial?: string;
  /** Letras que pide como mínimo; 0 o sin dato = opcional. */
  minimo?: number;
  peligro?: boolean;
  fn: (texto: string) => void | Promise<void>;
};

/**
 * Pide un texto corto en un diálogo del sistema, en lugar del `window.prompt` del navegador: se ve
 * igual que el resto de Core, dice qué falta en vez de descartar lo escrito, y si la acción falla el
 * texto se queda para reintentar.
 *
 *   const [pedir, setPedir] = useState<PedirTextoEstado | null>(null);
 *   setPedir({ titulo: "Rechazar", etiqueta: "Motivo", confirmar: "Rechazar", minimo: 1, fn: async (t) => { … } });
 *   <PedirTexto estado={pedir} onCerrar={() => setPedir(null)} />
 */
export default function PedirTexto({ estado, onCerrar }: { estado: PedirTextoEstado | null; onCerrar: () => void }) {
  const [texto, setTexto] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const cerrojo = useRef(false);
  const id = useId();

  useEffect(() => {
    if (!estado) return;
    setTexto(estado.inicial ?? "");
    setAviso(null);
    setError(null);
    setOcupado(false);
    cerrojo.current = false;
  }, [estado]);

  if (!estado) return null;

  const minimo = estado.minimo ?? 0;
  const enviar = async () => {
    if (cerrojo.current) return;
    const limpio = texto.trim();
    if (limpio.length < minimo) {
      setAviso(minimo === 1 ? "Escribe el motivo para continuar." : `Escribe al menos ${minimo} letras.`);
      return;
    }
    cerrojo.current = true;
    setOcupado(true);
    setError(null);
    try {
      await estado.fn(limpio);
      onCerrar();
    } catch (e) {
      setError(formatApiError(e, "No se pudo completar. Tu texto sigue aquí para reintentar."));
      cerrojo.current = false;
      setOcupado(false);
    }
  };

  return (
    <Modal
      open
      size="sm"
      title={estado.titulo}
      description={estado.descripcion}
      onClose={() => {
        if (!ocupado) onCerrar();
      }}
      footer={
        <>
          <Button variant="ghost" disabled={ocupado} onClick={onCerrar}>
            Cancelar
          </Button>
          <Button variant={estado.peligro ? "danger" : "primary"} loading={ocupado} onClick={() => void enviar()}>
            {estado.confirmar}
          </Button>
        </>
      }
    >
      {error ? <InlineAlert variant="danger" message={error} /> : null}
      <Field label={estado.etiqueta} optional={minimo === 0} required={minimo > 0} error={aviso ?? undefined}>
        <Textarea
          id={id}
          rows={3}
          value={texto}
          invalid={Boolean(aviso)}
          placeholder={estado.placeholder}
          onChange={(e) => {
            setTexto(e.target.value);
            if (aviso) setAviso(null);
          }}
        />
      </Field>
    </Modal>
  );
}
