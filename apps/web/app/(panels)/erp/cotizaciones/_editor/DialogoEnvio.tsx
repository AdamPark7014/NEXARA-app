"use client";

import { useState } from "react";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import { Alert, Button, Input, Textarea } from "@/components/base";
import type { CotizacionDetalle } from "@/lib/cotizaciones-api";
import { esCorreo } from "@/lib/cotizacion-documento";
import { folioAlEnviar } from "@/lib/cotizacion-folio";
import { formatApiError } from "@/lib/erp-api";
import { Campo } from "./campos";
import Dialogo from "./Dialogo";
import styles from "./editor.module.css";

function mensajeInicial(cliente: string, proyecto: string) {
  const saludo = cliente.trim() ? `Estimado(a) ${cliente.trim()}:` : "Buen día:";
  const sobre = proyecto.trim() ? ` para «${proyecto.trim()}»` : "";
  return `${saludo}\n\nLe compartimos nuestra propuesta técnica${sobre}. Quedamos atentos a sus comentarios y a cualquier ajuste que necesite.`;
}

/** Correos separados por coma, punto y coma o espacio. */
export function leerCopias(texto: string): { validos: string[]; invalidos: string[] } {
  const partes = texto
    .split(/[\s,;]+/)
    .map((c) => c.trim())
    .filter(Boolean);
  return { validos: partes.filter(esCorreo), invalidos: partes.filter((c) => !esCorreo(c)) };
}

/**
 * «Enviar por correo»: para, con copia y mensaje. El PDF va adjunto y el cliente recibe un enlace
 * para firmarla o rechazarla. Al salir, el folio suma las siglas de quienes intervinieron.
 */
export default function DialogoEnvio({
  detalle,
  cliente,
  proyecto,
  correoCliente,
  siglasUsuario,
  faltas,
  onCerrar,
  onEnviar,
}: {
  detalle: CotizacionDetalle;
  cliente: string;
  proyecto: string;
  correoCliente: string;
  /** Siglas de quien envía, si se conocen (entran a la cadena del folio). */
  siglasUsuario?: string | null;
  faltas: string[];
  onCerrar: () => void;
  onEnviar: (datos: { email: string; cc: string[]; message: string }) => Promise<void>;
}) {
  const [para, setPara] = useState(correoCliente);
  const [copias, setCopias] = useState("");
  const [mensaje, setMensaje] = useState(() => mensajeInicial(cliente, proyecto));
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cc = leerCopias(copias);
  const paraValido = esCorreo(para);
  const siglasAutor = detalle.elaboro?.siglas ?? null;
  const participantes = [...detalle.participantes.map((p) => p.siglas), siglasUsuario ?? null];
  const folio = folioAlEnviar({
    folio: detalle.folio,
    siglasAutor,
    participantes,
    yaEnviada: Boolean(detalle.sentAt),
    revision: detalle.revision,
  });
  const puede = paraValido && !cc.invalidos.length && !faltas.length && !enviando;

  async function enviar() {
    if (!puede) return;
    setEnviando(true);
    setError(null);
    try {
      await onEnviar({ email: para.trim(), cc: cc.validos, message: mensaje.trim() });
    } catch (e) {
      setError(formatApiError(e, "No se pudo enviar"));
      setEnviando(false);
    }
  }

  return (
    <Dialogo
      titulo="Enviar por correo"
      onCerrar={onCerrar}
      ocupado={enviando}
      pie={
        <>
          <Button variant="tertiary" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Button>
          <Button variant="primary" iconStart={<SendOutlinedIcon />} loading={enviando} onClick={() => void enviar()} disabled={!puede}>
            {enviando ? "Enviando…" : "Enviar"}
          </Button>
        </>
      }
    >
      {faltas.length ? (
        <Alert tone="warning" role="alert" dense>
          Antes de enviarla falta: {faltas.join(" y ")}.
        </Alert>
      ) : null}

      <Campo
        etiqueta="Para"
        htmlFor="envio-para"
        error={para && !paraValido ? "Ese correo no parece completo." : null}
      >
        <Input
          id="envio-para"
          type="email"
          value={para}
          onChange={(e) => setPara(e.target.value)}
          placeholder="compras@cliente.com"
          aria-invalid={Boolean(para) && !paraValido}
        />
      </Campo>
      <Campo
        etiqueta="Con copia (opcional)"
        htmlFor="envio-cc"
        error={cc.invalidos.length ? `Revisa: ${cc.invalidos.join(", ")}` : null}
        pista="Separa varios con coma."
      >
        <Input
          id="envio-cc"
          value={copias}
          onChange={(e) => setCopias(e.target.value)}
          placeholder="jefe@cliente.com, gerencia@nexara.com.mx"
          aria-invalid={cc.invalidos.length > 0}
        />
      </Campo>
      <Campo etiqueta="Mensaje" htmlFor="envio-mensaje">
        <Textarea id="envio-mensaje" className={styles.areaMensaje} value={mensaje} onChange={(e) => setMensaje(e.target.value)} />
      </Campo>

      <div className={styles.resumenEnvio}>
        <span>
          Sale como <strong className={styles.mono}>{folio}</strong>
          {folio !== detalle.folio ? " (con las siglas de quienes intervinieron)" : ""}.
        </span>
        <span>Adjunta el PDF de la propuesta y un enlace para que el cliente la firme o la rechace.</span>
        <span>Después de enviarla queda bloqueada: para cambiarla se crea una revisión.</span>
      </div>

      {error ? (
        <Alert tone="danger" role="alert" dense>
          {error}
        </Alert>
      ) : null}
    </Dialogo>
  );
}
