"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import HandymanOutlined from "@mui/icons-material/HandymanOutlined";
import HourglassBottomOutlined from "@mui/icons-material/HourglassBottomOutlined";
import ReportProblemOutlined from "@mui/icons-material/ReportProblemOutlined";
import Modal from "@/components/ui/Modal";
import {
  Alert,
  Button,
  Card,
  CardHead,
  DataTable,
  DateInput,
  Field,
  ListFooter,
  SkeletonRows,
  Stat,
  StatRow,
  StatusBadge,
  Textarea,
  type Column,
} from "@/components/base";
import { tonoDeVariante } from "@/components/almacen/PiezasAlmacen";
import ToolLoanTimeline from "@/components/ToolLoanTimeline";
import { useUser } from "@/components/UserContext";
import { toast } from "@/components/Toast";
import { formatApiError } from "@/lib/erp-api";
import {
  listMyToolRequests,
  requestToolRenewal,
  toolRequestStatusLabel,
  toolRequestStatusVariant,
  type ToolRequestRow,
} from "@/lib/tool-requests-api";
import { VisorEvidencia, faltaEvidencia } from "./EvidenciaPrestamo";
import { diaEnMexico, diaPactado, diaPactadoVencido, diaParaApi, textoDiaPactado } from "@/lib/dia-pactado";
import s from "./MisPrestamos.module.css";

/**
 * «Mis préstamos» en la web (antes solo estaba en las apps): en qué va cada herramienta que pedí,
 * el código que le dicto al almacén, cuándo la devuelvo, pedir más plazo y las fotos de cómo
 * salió y cómo volvió.
 */

function fmtFecha(valor: string | null) {
  if (!valor) return "—";
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-MX", { year: "numeric", month: "short", day: "numeric" });
}

/** Desde cuándo se puede pedir el nuevo plazo: el día siguiente a la devolución pactada o a hoy. */
export function primerDiaDePlazo(devolucionPactada: string | null, ahora: Date = new Date()): string {
  const hoy = diaEnMexico(ahora);
  const pactado = diaPactado(devolucionPactada);
  const base = pactado && pactado > hoy ? pactado : hoy;
  const siguiente = new Date(`${base}T12:00:00.000Z`);
  siguiente.setUTCDate(siguiente.getUTCDate() + 1);
  return siguiente.toISOString().slice(0, 10);
}

export function codigoVigente(p: Pick<ToolRequestRow, "status" | "pickupCode" | "pickupExpiresAt">, ahora = Date.now()) {
  if (p.status !== "APPROVED" || !p.pickupCode) return { visible: false, caducado: false };
  const caduca = p.pickupExpiresAt ? new Date(p.pickupExpiresAt).getTime() : null;
  const caducado = caduca != null && !Number.isNaN(caduca) && caduca < ahora;
  return { visible: !caducado, caducado };
}

export default function MisPrestamos() {
  const { user } = useUser();
  const token = user?.token ?? "";

  const [items, setItems] = useState<ToolRequestRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viendo, setViendo] = useState<ToolRequestRow | null>(null);

  const [plazo, setPlazo] = useState<ToolRequestRow | null>(null);
  const [nuevaFecha, setNuevaFecha] = useState("");
  const [motivo, setMotivo] = useState("");
  const [avisoPlazo, setAvisoPlazo] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const cerrojo = useRef(false);

  const cargar = useCallback(async () => {
    if (!token) return;
    setCargando(true);
    setError(null);
    try {
      setItems(await listMyToolRequests(token));
    } catch (e) {
      setError(formatApiError(e, "No se pudieron cargar tus préstamos"));
    } finally {
      setCargando(false);
    }
  }, [token]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const ahora = Date.now();
  const vencida = useCallback(
    (r: ToolRequestRow) => r.status === "IN_USE" && diaPactadoVencido(r.expectedReturnDate, new Date(ahora)),
    [ahora],
  );
  const cuentas = useMemo(
    () => ({
      enUso: items.filter((r) => r.status === "IN_USE").length,
      porRecoger: items.filter((r) => r.status === "APPROVED").length,
      vencidas: items.filter(vencida).length,
    }),
    [items, vencida],
  );

  const abrirPlazo = (r: ToolRequestRow) => {
    setPlazo(r);
    setNuevaFecha(primerDiaDePlazo(r.expectedReturnDate));
    setMotivo("");
    setAvisoPlazo(null);
    setGuardando(false);
    cerrojo.current = false;
  };

  const pedirPlazo = async () => {
    if (!plazo || cerrojo.current) return;
    if (!nuevaFecha) {
      setAvisoPlazo("Elige hasta qué día la necesitas.");
      return;
    }
    if (!motivo.trim()) {
      setAvisoPlazo("Escribe por qué necesitas más plazo.");
      return;
    }
    cerrojo.current = true;
    setGuardando(true);
    setAvisoPlazo(null);
    try {
      // El día elegido cuenta completo: se da por vencido hasta que ese día pasa.
      await requestToolRenewal(token, plazo.id, diaParaApi(nuevaFecha), motivo);
      toast.success("Pediste más plazo. Te avisamos cuando lo aprueben.");
      setPlazo(null);
      void cargar();
    } catch (e) {
      setAvisoPlazo(formatApiError(e, "No se pudo pedir más plazo. Lo que escribiste sigue aquí para reintentar."));
      cerrojo.current = false;
      setGuardando(false);
    }
  };

  const columnas: Column<ToolRequestRow>[] = [
    {
      key: "herramienta",
      label: "Herramienta",
      render: (r) => (
        <span className={s.doble}>
          <span className={s.fuerte}>{r.toolName}</span>
          <span className={s.tenue}>
            {r.model} · Serie {r.serialNumber}
          </span>
          <span className={s.tenue}>{r.activityLabel ?? "Préstamo suelto"}</span>
        </span>
      ),
    },
    {
      key: "estado",
      label: "En qué va",
      width: 250,
      render: (r) => (
        <div className={s.estado}>
          <span className={s.insignias}>
            <StatusBadge
              label={toolRequestStatusLabel(r.status)}
              tone={tonoDeVariante(toolRequestStatusVariant(r.status))}
              size="sm"
              dot
            />
            {vencida(r) ? <StatusBadge label="Vencida" tone="danger" size="sm" /> : null}
          </span>
          <ToolLoanTimeline
            status={r.status}
            requestDate={r.requestDate}
            approvalDate={r.approvalDate}
            pickedUpAt={r.pickedUpAt}
            deliveryDate={r.deliveryDate}
            returnDate={r.returnDate}
            compact
          />
          {r.status === "REJECTED" && r.adminNotes ? <span className={s.tenue}>Motivo: {r.adminNotes}</span> : null}
        </div>
      ),
    },
    {
      key: "codigo",
      label: "Código para recoger",
      width: 170,
      render: (r) => {
        const c = codigoVigente(r, ahora);
        if (c.visible) return <strong className={s.codigo}>{r.pickupCode}</strong>;
        if (c.caducado) return <StatusBadge label="Código caducado" tone="warning" size="sm" />;
        return <span className={s.tenue}>—</span>;
      },
    },
    {
      key: "devolucion",
      label: "Devolución",
      width: 120,
      // La devolución real es un instante; la pactada, un día.
      render: (r) => (
        <span className={s.fecha}>{r.returnDate ? fmtFecha(r.returnDate) : textoDiaPactado(r.expectedReturnDate)}</span>
      ),
    },
  ];

  const acciones = (r: ToolRequestRow) => (
    <>
      {faltaEvidencia(r).hay ? (
        <Button size="sm" variant="ghost" onClick={() => setViendo(r)}>
          Ver fotos
        </Button>
      ) : null}
      {r.status === "IN_USE" ? (
        <Button size="sm" variant="tonal" onClick={() => abrirPlazo(r)}>
          Pedir más plazo
        </Button>
      ) : null}
    </>
  );

  return (
    <div className={s.pila}>
      {!cargando || items.length > 0 ? (
        <StatRow ariaLabel="Resumen de mis préstamos" cols={3}>
          <Stat label="Las traigo yo" value={cuentas.enUso} hint="en uso" tone="brand" icon={<HandymanOutlined />} />
          <Stat
            label="Por recoger"
            value={cuentas.porRecoger}
            hint="aprobadas, esperan en almacén"
            tone={cuentas.porRecoger > 0 ? "warning" : "default"}
            icon={<HourglassBottomOutlined />}
            iconTone={cuentas.porRecoger > 0 ? "warning" : "neutral"}
          />
          <Stat
            label="Vencidas"
            value={cuentas.vencidas}
            hint="ya pasó su fecha de devolución"
            tone={cuentas.vencidas > 0 ? "danger" : "success"}
            icon={<ReportProblemOutlined />}
            iconTone={cuentas.vencidas > 0 ? "danger" : "success"}
            semaforo={cuentas.vencidas > 0 ? "rojo" : "verde"}
          />
        </StatRow>
      ) : null}

      <Card aria-label="Mis préstamos">
        <CardHead title="Mis préstamos" subtitle="Lo que pediste, el código para recogerlo y cuándo lo devuelves." />
        {error ? (
          <div className={s.avisos}>
            <Alert
              tone="danger"
              role="alert"
              action={
                <Button size="sm" variant="secondary" onClick={() => void cargar()}>
                  Reintentar
                </Button>
              }
            >
              {error}
            </Alert>
          </div>
        ) : null}
        {cargando && items.length === 0 ? (
          <div className={s.carga}>
            <SkeletonRows rows={4} label="Cargando tus préstamos" />
          </div>
        ) : error && items.length === 0 ? null : (
          <DataTable<ToolRequestRow>
            columns={columnas}
            rows={items}
            rowKey={(r) => r.id}
            flush
            ariaLabel="Mis préstamos de herramienta"
            rowActions={acciones}
            rowActionsLabel="Acciones"
            emptyTitle="Todavía no pides nada prestado"
            emptyDescription="Cuando pidas una herramienta en «Pedir prestado», aquí verás en qué va y el código para recogerla."
          />
        )}
        {!cargando && items.length > 0 ? <ListFooter total={items.length} unit="préstamos" /> : null}
      </Card>

      {plazo ? (
        <Modal
          open
          size="sm"
          title={`Más plazo para ${plazo.toolName}`}
          description={`Hoy la devuelves el ${textoDiaPactado(plazo.expectedReturnDate)}.`}
          onClose={() => {
            if (!guardando) setPlazo(null);
          }}
          footer={
            <>
              <Button variant="ghost" onClick={() => setPlazo(null)} disabled={guardando}>
                Cancelar
              </Button>
              <Button variant="primary" loading={guardando} onClick={() => void pedirPlazo()}>
                Pedir más plazo
              </Button>
            </>
          }
        >
          <div className={s.dialogo}>
            <Field label="La necesito hasta" required>
              <DateInput
                controlSize="lg"
                value={nuevaFecha}
                min={primerDiaDePlazo(plazo.expectedReturnDate)}
                onChange={(e) => {
                  setNuevaFecha(e.target.value);
                  setAvisoPlazo(null);
                }}
              />
            </Field>
            <Field label="Por qué" required hint="Quien administra las herramientas lo lee para decidir.">
              <Textarea
                rows={3}
                value={motivo}
                maxLength={500}
                onChange={(e) => {
                  setMotivo(e.target.value);
                  setAvisoPlazo(null);
                }}
              />
            </Field>
            {avisoPlazo ? (
              <Alert tone="warning" role="alert">
                {avisoPlazo}
              </Alert>
            ) : null}
          </div>
        </Modal>
      ) : null}

      <VisorEvidencia prestamo={viendo} onCerrar={() => setViendo(null)} />
    </div>
  );
}
