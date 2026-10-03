"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import InlineAlert from "@/components/ui/InlineAlert";
import {
  FORMATOS_ETIQUETA,
  FORMATO_ETIQUETA_DEFECTO,
  avisosDeEtiquetas,
  formatoEtiqueta,
  htmlEtiquetas,
  type FormatoEtiquetaId,
  type HerramientaEtiquetable,
} from "@/lib/etiquetas-herramienta";

/** El formato elegido se recuerda en este equipo: quien imprime siempre usa el mismo rollo. */
const CLAVE_FORMATO = "nexara:etiquetas:formato";

function formatoGuardado(): FormatoEtiquetaId {
  try {
    return formatoEtiqueta(window.localStorage.getItem(CLAVE_FORMATO)).id;
  } catch {
    return FORMATO_ETIQUETA_DEFECTO;
  }
}

type Props = {
  /** Herramientas a etiquetar. `null` o vacío = diálogo cerrado. */
  herramientas: HerramientaEtiquetable[] | null;
  /** De quién son, cuando es un kit: «Kit de José Antonio». */
  titulo?: string;
  onClose: () => void;
};

/**
 * «Imprimir etiqueta»: vista previa a tamaño real y envío a la impresora de etiquetas.
 *
 * No hay controlador propio. El documento vive en un `iframe` con su `@page` del tamaño
 * de la etiqueta y se imprime con el diálogo del navegador, en la impresora de etiquetas
 * que Windows tenga instalada. Así el resto de la pantalla no sale en la etiqueta.
 */
export default function EtiquetasHerramientaDialog({ herramientas, titulo, onClose }: Props) {
  const abierto = Boolean(herramientas && herramientas.length > 0);
  const lista = useMemo(() => herramientas ?? [], [herramientas]);
  const marcoRef = useRef<HTMLIFrameElement>(null);
  const [formatoId, setFormatoId] = useState<FormatoEtiquetaId>(FORMATO_ETIQUETA_DEFECTO);

  // Se lee al abrir (no al montar el módulo): en el servidor no hay localStorage.
  useEffect(() => {
    if (abierto) setFormatoId(formatoGuardado());
  }, [abierto]);

  const formato = formatoEtiqueta(formatoId);
  const documento = useMemo(() => htmlEtiquetas(lista, formato), [lista, formato]);
  const avisos = useMemo(() => avisosDeEtiquetas(lista, formato), [lista, formato]);

  const elegirFormato = (id: FormatoEtiquetaId) => {
    setFormatoId(id);
    try {
      window.localStorage.setItem(CLAVE_FORMATO, id);
    } catch {
      /* sin almacenamiento local se elige cada vez */
    }
  };

  const imprimir = () => {
    const ventana = marcoRef.current?.contentWindow;
    if (!ventana) return;
    // El foco va al marco: así el diálogo imprime las etiquetas y no la pantalla.
    ventana.focus();
    ventana.print();
  };

  const cuantas = lista.length;

  return (
    <Modal
      open={abierto}
      onClose={onClose}
      size="lg"
      title={cuantas === 1 ? "Imprimir etiqueta" : `Imprimir ${cuantas} etiquetas`}
      description={
        titulo ??
        "Cada etiqueta lleva el código interno de la herramienta en barras. Se pega en la herramienta y es lo que se escanea al entregarla y al recibirla."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
          <Button variant="primary" onClick={imprimir}>
            Imprimir
          </Button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 4, fontSize: 12.5 }}>
          <span style={{ fontWeight: 600 }}>Tamaño de etiqueta</span>
          <select
            className="input"
            value={formatoId}
            onChange={(e) => elegirFormato(e.target.value as FormatoEtiquetaId)}
          >
            {FORMATOS_ETIQUETA.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nombre}
              </option>
            ))}
          </select>
          <span style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>
            {formato.ayuda} En el diálogo de impresión elige la impresora de etiquetas, el mismo
            tamaño de papel y márgenes «Ninguno».
          </span>
        </label>

        {avisos.length > 0 && (
          <InlineAlert
            variant="warning"
            message={avisos.map((a) => a.mensaje).join(" ")}
          />
        )}

        <iframe
          ref={marcoRef}
          title="Vista previa de las etiquetas"
          srcDoc={documento}
          // Sin scripts: el documento es solo marcado. `allow-modals` es lo que deja
          // abrir el diálogo de impresión desde aquí.
          sandbox="allow-same-origin allow-modals"
          style={{
            width: "100%",
            height: Math.min(420, 60 + cuantas * (formato.altoMm * 3.78 + 18)),
            border: "1px solid var(--border)",
            borderRadius: 8,
            background: "#ececec",
          }}
        />
      </div>
    </Modal>
  );
}
