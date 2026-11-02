"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import { Alert, Button, DateInput, Textarea } from "@/components/base";
import { useUser } from "@/components/UserContext";
import {
  formatoFecha,
  formatoMoneda,
  ganarCotizacion,
  MEDIOS_ACEPTACION,
  MOTIVOS_PERDIDA,
  obtenerCotizacion,
  rechazarCotizacion,
  type CotizacionDetalle,
  type MedioAceptacion,
} from "@/lib/cotizaciones-api";
import { formatApiError } from "@/lib/erp-api";
import { medioProbableDeAceptacion, motivoDePerdida, salioEnPalabras } from "@/lib/hilo-negocio";
import { PersonaSelect, usePersonasAsignables } from "../../proyectos/_componentes/personas";
import { Campo } from "./campos";
import Dialogo from "./Dialogo";
import { ProximosAvisos } from "./YaLaEnvie";
import styles from "./editor.module.css";

const DIAS_DE_PLATICAS = 3;
const claveDePlaticas = (id: number) => `cotizacion-platicas-${id}`;

/** Hasta cuándo no volver a preguntar. Es comodidad de quien la consulta: si se pierde, se pregunta otra vez. */
function leerPlaticas(id: number): number | null {
  try {
    const hasta = Number(window.localStorage.getItem(claveDePlaticas(id)));
    return hasta > Date.now() ? hasta : null;
  } catch {
    return null;
  }
}

function guardarPlaticas(id: number, hasta: number | null) {
  try {
    if (hasta) window.localStorage.setItem(claveDePlaticas(id), String(hasta));
    else window.localStorage.removeItem(claveDePlaticas(id));
  } catch {
    /* Sin almacenamiento solo se vuelve a preguntar. */
  }
}

/** Opciones de un toque: se ven todas, sin abrir una lista. */
function Opciones<T extends string>({
  etiqueta,
  opciones,
  valor,
  onCambio,
}: {
  etiqueta: string;
  opciones: ReadonlyArray<{ id: T; label: string }>;
  valor: T | null;
  onCambio: (id: T) => void;
}) {
  return (
    <div className={styles.elecciones} role="radiogroup" aria-label={etiqueta}>
      {opciones.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={valor === o.id}
          className={styles.eleccion}
          onClick={() => onCambio(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function subtitulo(detalle: CotizacionDetalle) {
  const nombre = detalle.projectName?.trim() || detalle.clientCompany || detalle.clientName || detalle.folio;
  return `${nombre} · ${formatoMoneda(detalle.total, detalle.currency ?? "MXN")}`;
}

/**
 * «La ganamos»: dice cómo aceptó el cliente y deja el proyecto creado, con sus partidas como alcance.
 * Si ya estaba ganada y le falta el proyecto, solo crea el proyecto.
 */
export function DialogoGanada({
  detalle,
  onCerrar,
  onSinProyecto,
}: {
  detalle: CotizacionDetalle;
  onCerrar: () => void;
  /** Quedó ganada, pero el proyecto no se pudo crear: quien abrió el diálogo lo avisa y recarga. */
  onSinProyecto: (mensaje: string) => void;
}) {
  const router = useRouter();
  const { user, token } = useUser();
  const yaGanada = detalle.estado === "APROBADA";
  const conMedio = Boolean(detalle.aceptadaVia || detalle.signedAt);
  const [via, setVia] = useState<MedioAceptacion | null>(
    (detalle.aceptadaVia as MedioAceptacion | null | undefined) ??
      medioProbableDeAceptacion(detalle.enviadaPor, detalle.signedAt),
  );
  const [responsable, setResponsable] = useState(String(detalle.elaboro?.id ?? user?.id ?? ""));
  const [inicio, setInicio] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { personas } = usePersonasAsignables(token, user, detalle.elaboro ? [detalle.elaboro] : []);

  const partidas = (detalle.items ?? []).filter((i) => String(i.name ?? "").trim()).length;
  const efectos = [
    partidas === 1
      ? "Crea el proyecto con la partida como su alcance."
      : `Crea el proyecto con las ${partidas} partidas como su alcance.`,
    "Guarda lo cotizado para compararlo después contra lo real.",
    ...(yaGanada
      ? []
      : ["La pone en Por facturar, en la Mesa contable.", "Prepara el borrador de compra a CT, si lleva productos de CT."]),
  ];

  const confirmar = async () => {
    if (!token) return;
    setOcupado(true);
    setError(null);
    try {
      const r = await ganarCotizacion(token, detalle.id, {
        via: via ?? undefined,
        responsableId: responsable ? Number(responsable) : undefined,
        startDate: inicio || undefined,
      });
      if (r.proyecto) {
        router.push(`/erp/proyectos/${r.proyecto.id}`);
        return;
      }
      onSinProyecto(
        `La cotización quedó ganada, pero el proyecto no se pudo crear: ${r.errorProyecto ?? "error desconocido"}. Inténtalo otra vez con «Crear proyecto».`,
      );
    } catch (e) {
      setError(formatApiError(e, "No se pudo registrar."));
      setOcupado(false);
    }
  };

  return (
    <Dialogo
      titulo={yaGanada ? "Crear el proyecto" : "La ganamos"}
      onCerrar={onCerrar}
      ocupado={ocupado}
      pie={
        <>
          <Button variant="tertiary" onClick={onCerrar} disabled={ocupado}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={ocupado}
            disabled={(!via && !conMedio) || !responsable}
            onClick={() => void confirmar()}
          >
            {yaGanada ? "Crear proyecto" : "Confirmar y crear proyecto"}
          </Button>
        </>
      }
    >
      <p className={styles.dialogoSub}>{subtitulo(detalle)}</p>
      {!conMedio || !yaGanada ? (
        <Campo etiqueta="¿Cómo aceptó el cliente?">
          <Opciones etiqueta="¿Cómo aceptó el cliente?" opciones={MEDIOS_ACEPTACION} valor={via} onCambio={setVia} />
        </Campo>
      ) : null}
      <div className={styles.dialogoDoble}>
        <Campo etiqueta="¿Quién lo lleva?" htmlFor="ganada-responsable">
          <PersonaSelect
            id="ganada-responsable"
            value={responsable}
            onChange={setResponsable}
            personas={personas}
            vacio={null}
          />
        </Campo>
        <Campo etiqueta="¿Cuándo empieza?" htmlFor="ganada-inicio">
          <DateInput id="ganada-inicio" value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </Campo>
      </div>
      <div className={styles.queHaceSolo}>
        <strong>Al confirmar, Core hace esto solo</strong>
        <ul>
          {efectos.map((e) => (
            <li key={e}>
              <CheckRoundedIcon aria-hidden="true" />
              {e}
            </li>
          ))}
        </ul>
      </div>
      {yaGanada ? null : (
        <p className={styles.dialogoNota}>
          Una cotización ganada ya no se edita: es el compromiso con el cliente. Si cambia algo, se cotiza aparte.
        </p>
      )}
      {error ? (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      ) : null}
    </Dialogo>
  );
}

/** «La perdimos»: el motivo de un toque. Saber por qué se pierde es lo que ayuda a la siguiente. */
export function DialogoPerdida({
  detalle,
  onCerrar,
  onHecho,
}: {
  detalle: CotizacionDetalle;
  onCerrar: () => void;
  onHecho: (d: CotizacionDetalle) => void;
}) {
  const { token } = useUser();
  const [motivo, setMotivo] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmar = async () => {
    if (!token || !motivo) return;
    setOcupado(true);
    setError(null);
    try {
      onHecho(await rechazarCotizacion(token, detalle.id, motivoDePerdida(motivo, nota)));
    } catch (e) {
      setError(formatApiError(e, "No se pudo registrar."));
      setOcupado(false);
    }
  };

  return (
    <Dialogo
      titulo="La perdimos"
      onCerrar={onCerrar}
      ocupado={ocupado}
      pie={
        <>
          <Button variant="tertiary" onClick={onCerrar} disabled={ocupado}>
            Cancelar
          </Button>
          <Button variant="danger" loading={ocupado} disabled={!motivo} onClick={() => void confirmar()}>
            Marcar como perdida
          </Button>
        </>
      }
    >
      <p className={styles.dialogoSub}>Saber por qué se pierde es lo que ayuda a la siguiente.</p>
      <Campo etiqueta="¿Por qué?">
        <Opciones
          etiqueta="¿Por qué?"
          opciones={MOTIVOS_PERDIDA.map((m) => ({ id: m, label: m }))}
          valor={motivo}
          onCambio={setMotivo}
        />
      </Campo>
      <Campo etiqueta="Algo más, si quieres" htmlFor="perdida-nota">
        <Textarea
          id="perdida-nota"
          className={styles.areaNota}
          value={nota}
          maxLength={500}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Ej. Otro proveedor ofreció 12 % menos con cámaras de otra marca."
        />
      </Campo>
      <p className={styles.dialogoNota}>Queda como perdida con su motivo. Se puede retomar después con una versión nueva.</p>
      {error ? (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      ) : null}
    </Dialogo>
  );
}

/**
 * La franja que pregunta en qué terminó. Sin esta respuesta el negocio se queda parado en «enviada»:
 * ni proyecto, ni Por facturar, ni compra (Mapa de Core, Bloque A).
 */
export default function ComoTermino({
  detalle,
  onDetalle,
  onError,
  onAviso,
}: {
  detalle: CotizacionDetalle;
  onDetalle: (d: CotizacionDetalle) => void;
  onError: (m: string | null) => void;
  onAviso: (m: string) => void;
}) {
  const { token } = useUser();
  const [dialogo, setDialogo] = useState<"ganada" | "perdida" | null>(null);
  const [platicasHasta, setPlaticasHasta] = useState<number | null>(null);

  useEffect(() => setPlaticasHasta(leerPlaticas(detalle.id)), [detalle.id]);

  const ganadaSinProyecto = detalle.estado === "APROBADA" && !detalle.hilo?.proyecto;
  if (detalle.estado !== "ENVIADA" && !ganadaSinProyecto) return null;

  const dialogos = (
    <>
      {dialogo === "ganada" ? (
        <DialogoGanada
          detalle={detalle}
          onCerrar={() => setDialogo(null)}
          onSinProyecto={(mensaje) => {
            setDialogo(null);
            onError(mensaje);
            if (token) void obtenerCotizacion(token, detalle.id).then(onDetalle).catch(() => undefined);
          }}
        />
      ) : null}
      {dialogo === "perdida" ? (
        <DialogoPerdida
          detalle={detalle}
          onCerrar={() => setDialogo(null)}
          onHecho={(d) => {
            setDialogo(null);
            onDetalle(d);
            onAviso("Quedó como perdida, con su motivo.");
          }}
        />
      ) : null}
    </>
  );

  if (ganadaSinProyecto) {
    return (
      <>
        <section className={styles.yaLaEnvie} aria-label="Siguiente paso">
          <div className={styles.yaLaEnvieTexto}>
            <strong>Siguiente paso: crear el proyecto</strong>
            <span>La cotización ya está ganada. Con el proyecto se programa el trabajo y se le mide el costo.</span>
          </div>
          <div className={styles.yaLaEnvieBotones}>
            <Button size="sm" variant="primary" onClick={() => setDialogo("ganada")}>
              Crear proyecto
            </Button>
          </div>
        </section>
        {dialogos}
      </>
    );
  }

  if (platicasHasta) {
    return (
      <>
        <section className={styles.yaLaEnvie} aria-label="Sigue en pláticas">
          <div className={styles.yaLaEnvieTexto}>
            <strong>Sigue en pláticas</strong>
            <span>Te volvemos a preguntar el {formatoFecha(new Date(platicasHasta).toISOString())}.</span>
          </div>
          <div className={styles.yaLaEnvieBotones}>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                guardarPlaticas(detalle.id, null);
                setPlaticasHasta(null);
              }}
            >
              Ya respondió
            </Button>
          </div>
        </section>
        <ProximosAvisos sentAt={detalle.sentAt} validUntil={detalle.validUntil} />
      </>
    );
  }

  return (
    <>
      <section className={styles.yaLaEnvie} aria-label="Cómo terminó la cotización">
        <div className={styles.yaLaEnvieTexto}>
          <strong>¿Cómo terminó?</strong>
          <span>{salioEnPalabras(detalle.enviadaPor, detalle.sentAt)} Dinos qué dijo el cliente y seguimos desde ahí.</span>
        </div>
        <div className={styles.yaLaEnvieBotones}>
          <Button size="sm" variant="primary" onClick={() => setDialogo("ganada")}>
            La ganamos
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setDialogo("perdida")}>
            La perdimos
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              const hasta = Date.now() + DIAS_DE_PLATICAS * 24 * 60 * 60 * 1000;
              guardarPlaticas(detalle.id, hasta);
              setPlaticasHasta(hasta);
            }}
          >
            Sigue en pláticas
          </Button>
        </div>
      </section>
      {dialogos}
    </>
  );
}
