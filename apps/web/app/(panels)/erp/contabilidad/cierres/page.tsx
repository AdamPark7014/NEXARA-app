"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import TaskAltOutlinedIcon from "@mui/icons-material/TaskAltOutlined";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHead,
  DataTable,
  Field,
  ListCard,
  SkeletonRows,
  Stat,
  StatRow,
  Textarea,
  type Column,
  type Tone,
} from "@/components/base";
import { MesaPagina } from "@/components/mesa-contable/MesaPagina";
import Modal from "@/components/ui/Modal";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import { useUser } from "@/components/UserContext";
import { erpFetch, formatApiError } from "@/lib/erp-api";
import { toast } from "@/components/Toast";
import { DESTINOS, VacioConPrimerPaso } from "../_arranque";
import s from "./cierres.module.css";
import { formatoFechaLocal } from "@/lib/fecha-calendario";

type Period = {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  isClosed: boolean;
  closedAt?: string | null;
};

type EstadoItem = "ok" | "advertencia" | "bloqueante";

type ItemVerificacion = {
  id: string;
  etiqueta: string;
  descripcion: string;
  estado: EstadoItem;
  conteo: number;
  href: string | null;
};

type Checklist = {
  periodo: {
    id: number;
    nombre: string;
    inicio: string;
    fin: string;
    cerrado: boolean;
    cerradoEl: string | null;
  };
  items: ItemVerificacion[];
  bloqueantes: number;
  advertencias: number;
  puedeCerrar: boolean;
  requiereJustificacion: boolean;
  proteccion: { bloqueado: string[]; noBloqueado: string[] };
};

const MIN_JUSTIFICACION = 20;

/**
 * Lo que decide si el periodo puede cerrarse.
 *
 * Antes los tres estados llevaban un disco de color con un símbolo en blanco y
 * el renglón entero teñido: con diez puntos, la lista era un semáforo y el
 * bloqueante no se distinguía del aviso. Ahora lo resuelto se queda plano y
 * gris, y solo lo que impide cerrar lleva una regla roja al margen (la pinta el
 * CSS según el estado del renglón).
 */
const MARCA: Record<EstadoItem, { tono: Tone; texto: string; peso: number }> = {
  ok: { tono: "neutral", texto: "Listo", peso: 2 },
  advertencia: { tono: "warning", texto: "Revisar", peso: 1 },
  bloqueante: { tono: "danger", texto: "Bloquea el cierre", peso: 0 },
};

const fecha = (iso?: string | null) => formatoFechaLocal(iso, { day: "2-digit", month: "short", year: "numeric" });

export default function CierresPage() {
  const { user } = useUser();
  const token = user?.token ?? "";

  const [rows, setRows] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Period | null>(null);
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  const [closing, setClosing] = useState(false);
  /**
   * Lo que falló al cerrar. Antes solo salía en un toast: con el modal de
   * justificación abierto encima, el aviso pasaba por detrás y el periodo
   * parecía cerrado sin estarlo.
   */
  const [errorCierre, setErrorCierre] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [forceOpen, setForceOpen] = useState(false);
  const [justificacion, setJustificacion] = useState("");
  const [intentado, setIntentado] = useState(false);
  /** Cerrojo síncrono: cerrar dos veces el mismo periodo no es inocuo. */
  const cierreEnVueloRef = useRef(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await erpFetch<Period[] | { items?: Period[] }>(
        "accounting/accounts/fiscal-periods",
        token,
      );
      setRows(Array.isArray(data) ? data : (data?.items ?? []));
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const revisar = useCallback(
    async (period: Period) => {
      setSelected(period);
      setChecklist(null);
      setCheckError(null);
      setChecking(true);
      try {
        const data = await erpFetch<Checklist>(
          `accounting/workspace/cierres/${period.id}/checklist`,
          token,
        );
        setChecklist(data);
      } catch (e) {
        setCheckError(formatApiError(e));
      } finally {
        setChecking(false);
      }
    },
    [token],
  );

  async function cerrar(periodId: number, texto?: string) {
    if (cierreEnVueloRef.current) return;
    if (!selected) {
      const msg = "No hay un periodo seleccionado. Vuelve a elegirlo en la lista.";
      setErrorCierre(msg);
      toast.error(msg);
      return;
    }
    cierreEnVueloRef.current = true;
    setClosing(true);
    setErrorCierre(null);
    try {
      await erpFetch(`accounting/workspace/cierres/${periodId}/cerrar`, token, {
        method: "POST",
        body: JSON.stringify(texto ? { justificacion: texto } : {}),
      });
      toast.success(texto ? "Periodo cerrado con justificación" : "Periodo cerrado");
      setForceOpen(false);
      setJustificacion("");
      setIntentado(false);
      await load();
      const actualizado = { ...selected, isClosed: true };
      setSelected(actualizado);
      await revisar(actualizado);
    } catch (e) {
      // El modal de justificación se queda abierto con el motivo dentro: si se
      // cerrara, nadie sabría si el periodo quedó cerrado o no.
      const msg = `No se pudo cerrar el periodo. ${formatApiError(e)}`;
      setErrorCierre(msg);
      toast.error(msg);
    } finally {
      cierreEnVueloRef.current = false;
      setClosing(false);
    }
  }

  /**
   * El diálogo de confirmación pinta el mensaje en un solo párrafo: los saltos
   * de línea y las viñetas que llevaba se veían como una frase corrida. El
   * detalle de qué se bloquea ya está en la pantalla, completo y en lista;
   * aquí va solo lo que hay que confirmar.
   */
  function pedirConfirmacion(lista: Checklist) {
    const cuantos = lista.proteccion.bloqueado.length;
    setConfirmState({
      title: `Cerrar ${lista.periodo.nombre}`,
      message:
        `Del ${fecha(lista.periodo.inicio)} al ${fecha(lista.periodo.fin)}. ` +
        `Al cerrar, el sistema impedirá ${cuantos} ${cuantos === 1 ? "operación" : "operaciones"} sobre el periodo ` +
        `—las tienes listadas en la pantalla— y solo dirección podrá reabrirlo.`,
      confirmLabel: "Cerrar periodo",
      danger: false,
      fn: () => cerrar(lista.periodo.id),
    });
  }

  const columns: Column<Period>[] = [
    { key: "name", label: "Periodo" },
    {
      key: "range",
      label: "Fechas",
      render: (r) => `${fecha(r.startDate)} → ${fecha(r.endDate)}`,
    },
    {
      key: "status",
      label: "Estado",
      render: (r) => (
        <Badge
          dot
          size="sm"
          tone={r.isClosed ? "success" : "neutral"}
          title={r.isClosed ? "Solo dirección puede reabrirlo" : "Admite pólizas"}
        >
          {r.isClosed ? `Cerrado ${fecha(r.closedAt)}` : "Abierto"}
        </Badge>
      ),
    },
    {
      key: "actions",
      label: "",
      align: "right",
      render: (r) => (
        <Button
          size="sm"
          variant={selected?.id === r.id ? "secondary" : "ghost"}
          onClick={() => void revisar(r)}
          loading={checking && selected?.id === r.id}
        >
          {r.isClosed ? "Ver verificación" : "Revisar cierre"}
        </Button>
      ),
    },
  ];

  const bloqueado = (checklist?.bloqueantes ?? 0) > 0;
  const yaCerrado = checklist?.periodo.cerrado ?? false;
  /**
   * El API dice si este periodo exige justificación por escrito
   * (`requiereJustificacion`) y la pantalla lo ignoraba: decía «puedes cerrar»
   * y el servidor lo rechazaba sin que nadie supiera por qué.
   */
  const pideJustificacion = checklist?.requiereJustificacion ?? false;
  const conJustificacion = bloqueado || pideJustificacion;
  const hayMensajes = checking || Boolean(checkError) || Boolean(errorCierre) || Boolean(checklist);

  return (
    <MesaPagina
      titulo="Cierres"
      descripcion="Revisa la lista de verificación antes de cerrar. Al cerrar se bloquean las pólizas del periodo."
      terciarias={
        <Button variant="ghost" onClick={() => void load()} disabled={loading}>
          Actualizar
        </Button>
      }
    >
      {error && (
        <Alert
          tone="danger"
          role="alert"
          className={s.alerta}
          onDismiss={() => setError(null)}
          action={
            <Button size="sm" onClick={() => void load()}>
              Reintentar
            </Button>
          }
        >
          {`No se pudieron cargar los periodos. ${error}`}
        </Alert>
      )}

      <ListCard
        listLabel="Periodos fiscales"
        toolbar={
          <CardHead
            title="Periodos fiscales"
            subtitle="Elige el periodo que quieres cerrar para ver qué falta."
          />
        }
        empty={!loading && rows.length === 0}
        /* Sin configurar: no falta movimiento, falta el periodo en sí. */
        emptyState={
          <VacioConPrimerPaso
            variant="default"
            title="Todavía no hay periodos fiscales"
            description="Un periodo fiscal es el mes o el ejercicio que se cuadra y se cierra; sin ninguno no hay nada que verificar ni que bloquear. Créalo en Contabilidad general y vuelve aquí a revisarlo."
            destino={DESTINOS.periodoFiscal}
          />
        }
      >
        {loading ? (
          <div aria-busy="true">
            <p className={s.estado}>
              {token ? "Cargando periodos…" : "Esperando la sesión para pedir los periodos…"}
            </p>
            <SkeletonRows rows={3} label="Cargando periodos" />
          </div>
        ) : (
          <DataTable
            flush
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            density="compact"
            ariaLabel="Periodos de cierre"
          />
        )}
      </ListCard>

      {selected && (
        <Card aria-label="Lista de verificación">
          <CardHead
            title={
              <>
                <span className={s.sobretitulo}>Lista de verificación</span> {selected.name}
              </>
            }
            subtitle={`${fecha(selected.startDate)} → ${fecha(selected.endDate)}`}
            actions={
              checklist && !yaCerrado ? (
                <>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={conJustificacion || closing}
                    loading={closing && !forceOpen}
                    onClick={() => pedirConfirmacion(checklist)}
                    title={
                      bloqueado
                        ? "Resuelve los puntos que bloquean el cierre o ciérralo con justificación"
                        : pideJustificacion
                          ? "Este periodo exige justificación por escrito"
                          : undefined
                    }
                  >
                    Cerrar periodo
                  </Button>
                  {conJustificacion && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={closing}
                      onClick={() => {
                        setErrorCierre(null);
                        setIntentado(false);
                        setForceOpen(true);
                      }}
                    >
                      Cerrar con justificación
                    </Button>
                  )}
                </>
              ) : undefined
            }
          />

          {hayMensajes && (
            <div className={s.mensajes}>
              {checking && (
                <p className={s.calculando} aria-busy="true">
                  Calculando pendientes…
                </p>
              )}
              {checkError && (
                <Alert
                  tone="danger"
                  role="alert"
                  className={s.alerta}
                  action={
                    selected ? (
                      <Button size="sm" onClick={() => void revisar(selected)}>
                        Reintentar
                      </Button>
                    ) : undefined
                  }
                >
                  {`No se pudo calcular la verificación. ${checkError}`}
                </Alert>
              )}

              {/* El resultado del último intento de cierre, en la pantalla donde se
                  pulsó y no en un toast que se va. */}
              {errorCierre && (
                <Alert
                  tone="danger"
                  role="alert"
                  className={s.alerta}
                  onDismiss={() => setErrorCierre(null)}
                >
                  {errorCierre}
                </Alert>
              )}

              {checklist &&
                (yaCerrado ? (
                  <Alert tone="info" role="alert" className={s.alerta}>
                    {`Este periodo ya está cerrado${
                      checklist.periodo.cerradoEl ? ` desde el ${fecha(checklist.periodo.cerradoEl)}` : ""
                    }. Solo dirección puede reabrirlo.`}
                  </Alert>
                ) : bloqueado ? (
                  <Alert tone="danger" role="alert" className={s.alerta}>
                    {`${checklist.bloqueantes} ${
                      checklist.bloqueantes === 1
                        ? "punto bloquea el cierre"
                        : "puntos bloquean el cierre"
                    }. Resuélvelos —cada uno tiene su enlace— o cierra dejando una justificación por escrito.`}
                  </Alert>
                ) : pideJustificacion ? (
                  <Alert tone="warning" role="alert" className={s.alerta}>
                    Nada bloquea el cierre, pero este periodo exige una justificación por escrito para cerrarse.
                  </Alert>
                ) : (
                  <Alert tone="success" role="alert" className={s.alerta}>
                    Todo lo que bloquea el cierre está resuelto. Puedes cerrar el periodo.
                  </Alert>
                ))}
            </div>
          )}
        </Card>
      )}

      {selected && checklist && (
        <>
          <StatRow variant="strip" ariaLabel="Estado de la verificación">
            <Stat
              label="Bloquean el cierre"
              value={String(checklist.bloqueantes)}
              hint={
                checklist.bloqueantes > 0
                  ? "hay que resolverlos o justificar"
                  : "nada lo impide"
              }
              icon={<LockOutlinedIcon />}
              iconTone="neutral"
              tone={checklist.bloqueantes > 0 ? "danger" : "default"}
            />
            <Stat
              label="Para revisar"
              value={String(checklist.advertencias)}
              hint="no impiden cerrar"
              icon={<ReportProblemOutlinedIcon />}
              iconTone="neutral"
              tone={checklist.advertencias > 0 ? "warning" : "default"}
            />
            <Stat
              label="Resueltos"
              value={String(checklist.items.filter((i) => i.estado === "ok").length)}
              hint={`de ${checklist.items.length} puntos`}
              icon={<TaskAltOutlinedIcon />}
              iconTone="neutral"
            />
          </StatRow>

          <Card aria-label="Puntos de la verificación">
            <ul className={s.puntos}>
              {[...checklist.items]
                .sort((a, b) => MARCA[a.estado].peso - MARCA[b.estado].peso)
                .map((i) => {
                  const marca = MARCA[i.estado];
                  const pide = i.estado !== "ok";
                  return (
                    <li key={i.id} className={s.punto} data-estado={i.estado}>
                      <div className={s.puntoCuerpo}>
                        <div className={s.puntoTitulo}>
                          <span className={pide ? s.etiquetaPide : s.etiqueta}>{i.etiqueta}</span>
                          {i.conteo > 0 && (
                            <span className={s.conteo}>
                              {i.conteo} pendiente{i.conteo === 1 ? "" : "s"}
                            </span>
                          )}
                        </div>
                        <p className={s.descripcion}>{i.descripcion}</p>
                        {i.conteo > 0 && i.href && (
                          <Link href={i.href} className={s.resolver}>
                            Ir a resolverlo
                          </Link>
                        )}
                      </div>
                      {/* La palabra dice el estado, no el color: con la regla
                          roja invisible, «Bloquea el cierre» sigue leyéndose. */}
                      <Badge dot size="sm" tone={marca.tono}>
                        {marca.texto}
                      </Badge>
                    </li>
                  );
                })}
            </ul>

            <div className={s.proteccion}>
              <div>
                <strong className={s.proteccionTitulo}>Al cerrar se bloquea:</strong>
                <ul className={s.lista}>
                  {checklist.proteccion.bloqueado.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </div>
              {checklist.proteccion.noBloqueado.length > 0 ? (
                <div>
                  <strong className={s.proteccionAviso}>
                    Lo que el cierre todavía no bloquea:
                  </strong>
                  <ul className={s.lista}>
                    {checklist.proteccion.noBloqueado.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </Card>
        </>
      )}

      <Modal
        open={forceOpen}
        onClose={() => {
          setForceOpen(false);
          setErrorCierre(null);
          setIntentado(false);
        }}
        title={bloqueado ? "Cerrar con puntos pendientes" : "Cerrar con justificación"}
        dirty={justificacion.trim().length > 0}
        maxWidth={560}
        footer={
          <div className={s.modalPie}>
            <Button
              variant="ghost"
              onClick={() => {
                setForceOpen(false);
                setErrorCierre(null);
                setIntentado(false);
              }}
              disabled={closing}
            >
              Cancelar
            </Button>
            {/* Habilitado siempre: si se deshabilitara por falta de texto, el
                botón no reaccionaría y tampoco diría qué falta. Al pulsarlo,
                el campo lo explica debajo. */}
            <Button
              variant="danger"
              loading={closing}
              onClick={() => {
                setIntentado(true);
                if (!checklist) {
                  setErrorCierre("La verificación ya no está cargada. Vuelve a revisar el periodo.");
                  return;
                }
                if (justificacion.trim().length < MIN_JUSTIFICACION) return;
                void cerrar(checklist.periodo.id, justificacion.trim());
              }}
            >
              {closing ? "Cerrando…" : "Cerrar de todos modos"}
            </Button>
          </div>
        }
      >
        {errorCierre && (
          <Alert tone="danger" role="alert" onDismiss={() => setErrorCierre(null)}>
            {errorCierre}
          </Alert>
        )}
        <p className={s.explica}>
          Vas a cerrar <strong>{checklist?.periodo.nombre}</strong>
          {bloqueado
            ? ` con ${checklist?.bloqueantes ?? 0} ${
                (checklist?.bloqueantes ?? 0) === 1 ? "punto" : "puntos"
              } sin resolver`
            : ", que exige justificación por escrito"}
          . Escribe por qué; queda en la bitácora de auditoría con tu nombre, la fecha y el estado
          anterior del periodo.
        </p>
        {checklist && bloqueado && (
          <ul className={s.bloquean}>
            {checklist.items
              .filter((i) => i.estado === "bloqueante")
              .map((i) => (
                <li key={i.id}>
                  {i.etiqueta}: {i.conteo} {i.conteo === 1 ? "pendiente" : "pendientes"}
                </li>
              ))}
          </ul>
        )}
        <Field
          label="Justificación"
          hint={`Mínimo ${MIN_JUSTIFICACION} caracteres · llevas ${justificacion.trim().length}.`}
          error={
            justificacion.trim().length < MIN_JUSTIFICACION &&
            (intentado || justificacion.trim().length > 0)
              ? justificacion.trim().length === 0
                ? "Escribe por qué se cierra así; sin esto no se puede cerrar."
                : `Faltan ${MIN_JUSTIFICACION - justificacion.trim().length} caracteres para poder cerrar.`
              : null
          }
        >
          <Textarea
            id="justificacion-cierre"
            className={s.justificacion}
            value={justificacion}
            onChange={(e) => setJustificacion(e.target.value)}
            rows={4}
            aria-invalid={
              intentado && justificacion.trim().length < MIN_JUSTIFICACION ? true : undefined
            }
            placeholder="Ej. Cierre autorizado por dirección: las pólizas pendientes se reponen en el siguiente periodo."
          />
        </Field>
      </Modal>

      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} danger={false} />
    </MesaPagina>
  );
}
