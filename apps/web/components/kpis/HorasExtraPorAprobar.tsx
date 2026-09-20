"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import TaskAltOutlinedIcon from "@mui/icons-material/TaskAltOutlined";
import { Alert, Badge, Button, Card, CardHead, EmptyState, InfoPopover, SkeletonRows, fieldClass, tabla } from "@/components/base";
import { formatApiError } from "@/lib/erp-api";
import {
  ESTADO_EXTRA_ETIQUETA,
  decidirHorasExtra,
  fetchDecisionesExtra,
  type DecisionExtra,
  type EstadoExtra,
} from "@/lib/asistencia-confiable-api";
import estilo from "@/components/asistencias/asistencia-confiable.module.css";

/**
 * Horas extra por aprobar.
 *
 * Calculado no es autorizado: alguien puede quedarse dos horas de más por su cuenta. El
 * jefe dice sí o no día por día —y puede autorizar menos de lo que salió— y solo lo
 * aprobado llega a la pre-nómina.
 *
 * La lista de días la trae quien usa el componente (el detalle de KPI ya los tiene);
 * aquí solo viven la decisión y su estado.
 */

export type DiaConExtra = {
  fecha: string;
  minutosExtra: number;
  /** Nombre de la persona, cuando el panel muestra a varias. */
  persona?: string;
};

const TONO: Record<EstadoExtra, "success" | "danger" | "warning"> = {
  APROBADO: "success",
  RECHAZADO: "danger",
  PENDIENTE: "warning",
};

const horasYMin = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} h ${m ? `${m} min` : ""}`.trim() : `${m} min`;
};

const diaLegible = (fecha: string) => {
  const [y, m, d] = fecha.split("-");
  return `${d}/${m}/${y}`;
};

export default function HorasExtraPorAprobar({
  token,
  userId,
  dias,
  rango,
  onDecidido,
}: {
  token: string;
  userId: number;
  dias: DiaConExtra[];
  rango: { desde: string; hasta: string };
  /** Para que quien nos usa recargue sus totales cuando cambia una decisión. */
  onDecidido?: () => void;
}) {
  const [decisiones, setDecisiones] = useState<DecisionExtra[] | null>(null);
  const [minutos, setMinutos] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      setDecisiones(await fetchDecisionesExtra(token, rango, userId));
    } catch (e) {
      setDecisiones(null);
      setError(formatApiError(e, "No se pudieron cargar las decisiones"));
    }
  }, [token, rango, userId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const porFecha = useMemo(
    () => new Map((decisiones ?? []).map((d) => [d.fecha, d])),
    [decisiones],
  );

  const conExtra = useMemo(() => dias.filter((d) => d.minutosExtra > 0), [dias]);

  const decidir = async (dia: DiaConExtra, estado: EstadoExtra) => {
    const escrito = Number(minutos[dia.fecha]);
    const autorizados = Number.isFinite(escrito) && escrito > 0 ? Math.round(escrito) : dia.minutosExtra;
    setOcupado(dia.fecha);
    setError(null);
    try {
      await decidirHorasExtra(token, {
        userId,
        fecha: dia.fecha,
        // Rechazar no autoriza nada, pero el número deja constancia de qué se rechazó.
        minutos: estado === "APROBADO" ? autorizados : dia.minutosExtra,
        estado,
      });
      await cargar();
      onDecidido?.();
    } catch (e) {
      setError(formatApiError(e, "No se pudo guardar la decisión"));
    } finally {
      setOcupado(null);
    }
  };

  const pendientes = conExtra.filter((d) => !porFecha.has(d.fecha)).length;

  return (
    <Card>
      <CardHead
        title="Horas extra"
        actions={
          <>
            {pendientes ? <Badge tone="warning">{pendientes} por decidir</Badge> : null}
            <InfoPopover label="¿Por qué hay que aprobarlas?" title="Horas extra">
              <p style={{ margin: "0 0 8px" }}>
                El sistema <strong style={{ color: "var(--ui-fg)" }}>calcula</strong> el tiempo extra de cada día,
                pero calculado no es autorizado: alguien puede quedarse de más por su cuenta.
              </p>
              <ul>
                <li>A la pre-nómina solo llegan los minutos aprobados.</li>
                <li>Se puede autorizar menos de lo que salió: escribe los minutos antes de aprobar.</li>
                <li>Lo aprobado se queda como se aprobó; corregir después una checada no lo cambia solo.</li>
                <li>Un día rechazado ya se miró: deja de contar como pendiente y no se paga.</li>
              </ul>
            </InfoPopover>
          </>
        }
      />

      {error ? (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      ) : null}

      {!decisiones ? (
        <SkeletonRows rows={3} label="Cargando decisiones" />
      ) : conExtra.length ? (
        <div className={tabla.tabla} role="table" aria-label="Horas extra por aprobar">
          <div className={`${tabla.cabeza} ${estilo.extra}`} role="row">
            <span role="columnheader">Día</span>
            <span role="columnheader" className={tabla.num}>
              Calculado
            </span>
            <span role="columnheader" className={tabla.num}>
              Autorizar
            </span>
            <span role="columnheader">Estado</span>
            <span role="columnheader" />
          </div>
          {conExtra.map((d) => {
            const decision = porFecha.get(d.fecha);
            const trabajando = ocupado === d.fecha;
            return (
              <div key={d.fecha} className={`${tabla.fila} ${estilo.extra}`} role="row">
                <span className={tabla.celda} role="cell">
                  <span className={tabla.fuerte}>{diaLegible(d.fecha)}</span>
                  {d.persona ? <span className={tabla.tenue}>{d.persona}</span> : null}
                </span>
                <span className={tabla.num} role="cell">
                  {horasYMin(d.minutosExtra)}
                </span>
                <span role="cell">
                  <input
                    type="number"
                    min={0}
                    max={720}
                    className={`${fieldClass} ${estilo.campo} ${estilo.campoCorto}`}
                    placeholder={String(d.minutosExtra)}
                    value={minutos[d.fecha] ?? ""}
                    aria-label={`Minutos a autorizar del ${diaLegible(d.fecha)}`}
                    onChange={(e) => setMinutos((p) => ({ ...p, [d.fecha]: e.target.value }))}
                  />
                </span>
                <span className={tabla.celda} role="cell">
                  {decision ? (
                    <>
                      <Badge tone={TONO[decision.estado]} dot>
                        {ESTADO_EXTRA_ETIQUETA[decision.estado]}
                        {decision.estado === "APROBADO" ? ` · ${horasYMin(decision.minutos)}` : ""}
                      </Badge>
                      {decision.aprobadoPor ? (
                        <span className={tabla.tenue}>{decision.aprobadoPor.nombre}</span>
                      ) : null}
                    </>
                  ) : (
                    <Badge tone="warning" dot>
                      Por aprobar
                    </Badge>
                  )}
                </span>
                <span className={estilo.acciones} role="cell">
                  <Button
                    variant="primary"
                    disabled={trabajando || decision?.estado === "APROBADO"}
                    onClick={() => void decidir(d, "APROBADO")}
                  >
                    Aprobar
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={trabajando || decision?.estado === "RECHAZADO"}
                    onClick={() => void decidir(d, "RECHAZADO")}
                  >
                    Rechazar
                  </Button>
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<TaskAltOutlinedIcon />}
          title="Sin tiempo extra en estas fechas"
          description="Nadie pasó de su jornada ordinaria."
        />
      )}
    </Card>
  );
}
