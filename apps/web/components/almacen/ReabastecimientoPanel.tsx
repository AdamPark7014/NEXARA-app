"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ShoppingCartOutlinedIcon from "@mui/icons-material/ShoppingCartOutlined";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import HourglassBottomOutlinedIcon from "@mui/icons-material/HourglassBottomOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import {
  Alert,
  Button,
  Card,
  CardHead,
  Checkbox,
  DataTable,
  SkeletonRows,
  Stat,
  StatRow,
  StatusBadge,
  type Column,
} from "@/components/base";
import { useUser } from "@/components/UserContext";
import { toast } from "@/components/Toast";
import { formatApiError } from "@/lib/erp-api";
import {
  listarReabastecimiento,
  recalcularReabastecimiento,
  type RenglonReabastecimiento,
} from "@/lib/almacen-api";
import { cantidadLegible, pluralEmpaque } from "@/lib/empaque";
import InfoBreve from "./InfoBreve";
import s from "./ReabastecimientoPanel.module.css";

const INFO =
  "El mínimo sale del consumo real de los últimos 90 días por los días que tarda el proveedor en entregar, más los días de seguridad. La cantidad sugerida ya viene subida al empaque y a la compra mínima. Solo aplica a material marcado como circulante.";

function fechaCorta(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
}

type TonoCobertura = "danger" | "warning" | "success" | "neutral";

/** Semáforo de cobertura: rojo ≤ 2 días, ámbar ≤ 7, verde si alcanza más; gris sin dato. */
function toneCobertura(dias: number | null): TonoCobertura {
  if (dias == null) return "neutral";
  if (dias <= 2) return "danger";
  if (dias <= 7) return "warning";
  return "success";
}

/** Los días de cobertura no se comunican solo con color: la palabra lo dice. */
function cobertura(dias: number | null): { tono: TonoCobertura; texto: string } {
  const tono = toneCobertura(dias);
  if (dias == null) return { tono, texto: "Sin dato" };
  if (tono === "danger") return { tono, texto: `Se acaba en ${cantidadLegible(dias)} d` };
  if (tono === "warning") return { tono, texto: `${cantidadLegible(dias)} d, poco` };
  return { tono, texto: `${cantidadLegible(dias)} d` };
}

/**
 * «Reabastecimiento»: qué comprar y cuánto.
 *
 * Lo urgente arriba (menos días de cobertura primero). Por defecto solo lo que tocó el
 * mínimo; la casilla enseña todo el material circulante para revisar parámetros.
 */
export default function ReabastecimientoPanel() {
  const { user } = useUser();
  const token = user?.token ?? "";

  const [filas, setFilas] = useState<RenglonReabastecimiento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [todos, setTodos] = useState(false);
  const [recalculando, setRecalculando] = useState(false);

  const cargar = useCallback(async () => {
    if (!token) return;
    setCargando(true);
    setError(null);
    try {
      setFilas(await listarReabastecimiento(token, { todos }));
    } catch (e) {
      // Un fallo al refrescar no borra lo que ya se veía.
      setError(formatApiError(e, "No se pudo cargar el reabastecimiento"));
    } finally {
      setCargando(false);
    }
  }, [token, todos]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const recalcular = async () => {
    if (!token) return;
    setRecalculando(true);
    try {
      const res = await recalcularReabastecimiento(token);
      toast.success(`${res.recalculados} renglones recalculados`);
      await cargar();
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo recalcular"));
    } finally {
      setRecalculando(false);
    }
  };

  const porComprar = useMemo(() => filas.filter((f) => f.reponer).length, [filas]);
  const ultimoCalculo = useMemo(
    () => filas.map((f) => f.calculadoAt).filter(Boolean).sort().at(-1) ?? null,
    [filas],
  );
  const seAcaba = useMemo(
    () => filas.filter((f) => f.diasDeCobertura != null && f.diasDeCobertura <= 2).length,
    [filas],
  );
  const aprietan = useMemo(
    () =>
      filas.filter(
        (f) => f.diasDeCobertura != null && f.diasDeCobertura > 2 && f.diasDeCobertura <= 7,
      ).length,
    [filas],
  );

  const columnas: Column<RenglonReabastecimiento>[] = [
    {
      key: "producto",
      label: "Material",
      render: (r) => (
        <div className={s.doble}>
          <strong className={s.fuerte}>{r.producto}</strong>
          <span className={s.tenue}>
            {r.sku} · {r.almacen}
          </span>
        </div>
      ),
      width: 240,
    },
    {
      key: "disponible",
      label: "Disponible",
      numeric: true,
      width: 96,
      render: (r) => (
        <span title={`${r.onHand} en existencia, ${r.reservado} apartado`}>
          {cantidadLegible(r.disponible)} {r.unidadBase}
        </span>
      ),
    },
    {
      key: "min",
      label: "Mín / Máx",
      numeric: true,
      width: 104,
      render: (r) => (
        <span className={s.apagado}>
          {cantidadLegible(r.min)} / {cantidadLegible(r.max)}
        </span>
      ),
    },
    {
      key: "cobertura",
      label: "Alcanza para",
      width: 140,
      render: (r) => {
        const { tono, texto } = cobertura(r.diasDeCobertura);
        return <StatusBadge className={s.semaforo} size="sm" tone={tono} label={texto} />;
      },
    },
    {
      key: "consumo",
      label: "Consumo/día",
      numeric: true,
      width: 100,
      render: (r) => (
        <span
          className={s.apagado}
          title={r.historiaCorta ? "Poca historia: el número es orientativo" : undefined}
        >
          {cantidadLegible(r.consumoDiario)}
          {r.historiaCorta ? " *" : ""}
        </span>
      ),
    },
    {
      key: "sugerido",
      label: "Comprar",
      numeric: true,
      width: 138,
      render: (r) =>
        r.sugerido > 0 ? (
          <div className={s.doble}>
            <strong className={s.fuerte}>
              {r.sugeridoEmpaque
                ? `${cantidadLegible(r.sugeridoEmpaque.unidades)} ${pluralEmpaque(r.sugeridoEmpaque.nombre, r.sugeridoEmpaque.unidades)}`
                : `${cantidadLegible(r.sugerido)} ${r.unidadBase}`}
            </strong>
            {r.sugeridoEmpaque && (
              <span className={s.tenue}>
                {cantidadLegible(r.sugerido)} {r.unidadBase}
              </span>
            )}
          </div>
        ) : (
          <span className={s.vacio}>—</span>
        ),
    },
    {
      key: "lead",
      label: "Entrega en",
      numeric: true,
      width: 76,
      render: (r) => (
        <span className={s.apagado} title="Días que tarda el proveedor">
          {r.leadTimeDias} d
        </span>
      ),
    },
    {
      key: "calculado",
      label: "Calculado",
      width: 86,
      render: (r) => <span className={s.fecha}>{fechaCorta(r.calculadoAt)}</span>,
    },
  ];

  const subtitulo = ultimoCalculo
    ? `Último cálculo: ${new Date(ultimoCalculo).toLocaleString("es-MX", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })}`
    : undefined;

  return (
    <>
      {!cargando && filas.length > 0 && (
        <StatRow ariaLabel="Resumen de reabastecimiento" cols={3}>
          <Stat
            label="Por comprar"
            value={porComprar}
            hint="llegaron a su mínimo"
            tone={porComprar > 0 ? "brand" : "default"}
            icon={<ShoppingCartOutlinedIcon />}
          />
          <Stat
            label="Se acaban ya"
            value={seAcaba}
            hint="2 días o menos"
            tone={seAcaba > 0 ? "danger" : "default"}
            icon={<ReportProblemOutlinedIcon />}
            iconTone={seAcaba > 0 ? "danger" : "neutral"}
            semaforo={seAcaba > 0 ? "rojo" : "verde"}
          />
          <Stat
            label="Aprietan"
            value={aprietan}
            hint="menos de una semana"
            tone={aprietan > 0 ? "warning" : "default"}
            icon={<HourglassBottomOutlinedIcon />}
            iconTone={aprietan > 0 ? "warning" : "neutral"}
            semaforo={aprietan > 0 ? "ambar" : "verde"}
          />
        </StatRow>
      )}

      <Card>
        <CardHead
          title="Qué comprar"
          subtitle={subtitulo}
          actions={
            <>
              <Checkbox
                label="Ver todo el circulante"
                checked={todos}
                onChange={(e) => setTodos(e.target.checked)}
              />
              <Button
                size="sm"
                variant="secondary"
                iconStart={<RefreshOutlinedIcon />}
                onClick={() => void recalcular()}
                loading={recalculando}
              >
                Recalcular
              </Button>
              <InfoBreve etiqueta="Cómo se calcula el reabastecimiento" texto={INFO} />
            </>
          }
        />

        {error && (
          <div className={s.aviso}>
            <Alert
              tone={filas.length > 0 ? "warning" : "danger"}
              role="alert"
              action={
                <Button size="sm" variant="secondary" onClick={() => void cargar()}>
                  Reintentar
                </Button>
              }
            >
              {filas.length > 0 ? `${error}. Se muestra lo último que cargó.` : error}
            </Alert>
          </div>
        )}

        {cargando && filas.length === 0 ? (
          <div className={s.carga}>
            <SkeletonRows rows={6} label="Cargando reabastecimiento" />
          </div>
        ) : error && filas.length === 0 ? null : (
          <DataTable
            columns={columnas}
            rows={filas}
            rowKey={(r) => r.stockLevelId}
            density="compact"
            flush
            ariaLabel="Material por comprar"
            emptyTitle={todos ? "Aún no hay material circulante" : "Nada por comprar ahora"}
            emptyDescription={
              todos
                ? "El reabastecimiento solo mira el material marcado como circulante. Marca así los productos de consumo en su ficha y volverán a salir aquí."
                : "Ningún material circulante llegó a su mínimo. Marca «Ver todo el circulante» para revisar mínimos y máximos antes de que aprieten."
            }
          />
        )}
      </Card>
    </>
  );
}
