"use client";

/**
 * Una actividad comercial **es** una cotización (contrato del viernes, D). Cualquier otro tipo (proyecto,
 * obra, servicio, tarea) también puede llevar ligada la cotización de ese trabajo (Adam, 15-11: «homologado
 * en todos los tipos»), pero ahí la cotización no mueve el avance de la actividad.
 *
 * Desde el detalle de la actividad: «Hacer cotización» la crea con ese cliente y las deja ligadas;
 * «Ligar cotización» conecta una que ya existe. La evidencia del levantamiento pasa a ser anexo de
 * la propuesta sin volver a subirla, así que no hay que adjuntar nada dos veces.
 */
import { aqui, conRegreso } from "@/lib/regreso";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useUser } from "@/components/UserContext";
import { canUserAccessPath } from "@/lib/user-access";
import PropuestaEmbebida from "./PropuestaEmbebida";
import { Alert, Button, ButtonLink, RecordSection, Select } from "@/components/base";
import s from "./CotizacionDeActividad.module.css";
import {
  ESTADO_LABEL,
  formatoMoneda,
  ligarActividadACotizacion,
  listarCotizaciones,
  type CotizacionRow,
  type EstadoCotizacion,
} from "@/lib/cotizaciones-api";

export type CotizacionLigada = {
  id: number;
  quoteNumber: string;
  status?: string | null;
  total?: number | string | null;
  segmento?: string | null;
};

const estadoEnEspanol = (status?: string | null): string => {
  const mapa: Record<string, EstadoCotizacion> = {
    DRAFT: "BORRADOR",
    SENT: "ENVIADA",
    APPROVED: "APROBADA",
    REJECTED: "RECHAZADA",
    EXPIRED: "VENCIDA",
  };
  const estado = mapa[String(status ?? "").toUpperCase()];
  return estado ? ESTADO_LABEL[estado] : "Borrador";
};

export default function CotizacionDeActividad({
  activityId,
  coreKind,
  cotizacion,
  onLigada,
  enSeccion = false,
}: {
  activityId: number;
  coreKind?: string | null;
  cotizacion?: CotizacionLigada | null;
  onLigada?: () => void;
  /** Se pinta dentro de su propia sección «Cotización» (el detalle de la actividad). */
  enSeccion?: boolean;
}) {
  const { token, user } = useUser();
  const esComercial = String(coreKind ?? "").toLowerCase() === "comercial";
  // En los demás tipos la sección solo estorba a quien no cotiza: se ve si ya hay una ligada o si puede ligarla.
  const puedeCotizar = canUserAccessPath(user, "/erp/cotizaciones");

  const [eligiendo, setEligiendo] = useState(false);
  const [opciones, setOpciones] = useState<CotizacionRow[]>([]);
  const [elegida, setElegida] = useState("");
  const [ligando, setLigando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!eligiendo || !token) return;
    let vivo = true;
    listarCotizaciones(token)
      .then((rows) => vivo && setOpciones(rows))
      .catch((e) => vivo && setError(e instanceof Error ? e.message : "No se pudieron cargar"));
    return () => {
      vivo = false;
    };
  }, [eligiendo, token]);

  const disponibles = useMemo(
    () => opciones.filter((row) => !(row.actividades ?? []).some((a) => a.id === activityId)),
    [opciones, activityId],
  );

  if (!esComercial && !cotizacion?.id && !puedeCotizar) return null;

  const envolver = (contenido: ReactNode) => (enSeccion ? <RecordSection title="Cotización">{contenido}</RecordSection> : contenido);

  if (cotizacion?.id) {
    return envolver(
      <div className={s.caja}>
        <p className={s.texto}>
          Cotización{" "}
          <Link href={conRegreso(`/erp/cotizaciones/${cotizacion.id}`, aqui())} className={s.liga}>
            {cotizacion.quoteNumber}
          </Link>{" "}
          · {estadoEnEspanol(cotizacion.status)}
          {cotizacion.total != null ? ` · ${formatoMoneda(Number(cotizacion.total))}` : ""}
          <br />
          <span className={s.secundario}>
            Las fotos del levantamiento de esta actividad salen como anexos (03 Planos) de la propuesta.
          </span>
        </p>
        <PropuestaEmbebida cotizacionId={cotizacion.id} quoteNumber={cotizacion.quoteNumber} token={token} />
      </div>,
    );
  }

  async function ligar() {
    if (!token || !elegida) return;
    setLigando(true);
    setError(null);
    try {
      await ligarActividadACotizacion(token, Number(elegida), activityId);
      setEligiendo(false);
      onLigada?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo ligar. Elige otra cotización o inténtalo de nuevo.");
    } finally {
      setLigando(false);
    }
  }

  return envolver(
    <div className={s.caja}>
      <p className={`${s.texto} ${s.secundario}`}>
        {esComercial
          ? "Esta actividad es comercial: su entregable es una cotización, no una hoja de servicio."
          : "Liga la cotización de este trabajo para tenerla a la mano. No cambia el avance de la actividad."}
      </p>
      <div className={s.acciones}>
        <ButtonLink href={`/erp/cotizaciones/nueva?activityId=${activityId}`}>Hacer cotización</ButtonLink>
        <Button type="button" variant="secondary" onClick={() => setEligiendo((v) => !v)}>
          Ligar cotización
        </Button>
      </div>

      {eligiendo ? (
        <div className={s.ligarFila}>
          <Select
            className={s.selector}
            value={elegida}
            onChange={(e) => setElegida(e.target.value)}
            aria-label="Elegir cotización para ligar"
          >
            <option value="">Elige una cotización…</option>
            {disponibles.map((row) => (
              <option key={row.id} value={row.id}>
                {row.folio} · {row.clienteNombre ?? "sin cliente"} · {row.estadoEtiqueta}
              </option>
            ))}
          </Select>
          <Button type="button" onClick={() => void ligar()} disabled={!elegida || ligando} loading={ligando}>
            {ligando ? "Ligando…" : "Ligar"}
          </Button>
        </div>
      ) : null}

      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>,
  );
}
