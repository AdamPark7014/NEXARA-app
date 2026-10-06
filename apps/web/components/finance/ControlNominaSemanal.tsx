"use client";

import {
  Fragment,
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import AddIcon from "@mui/icons-material/Add";
import CheckIcon from "@mui/icons-material/Check";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import EventBusyOutlinedIcon from "@mui/icons-material/EventBusyOutlined";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import LockOpenOutlinedIcon from "@mui/icons-material/LockOpenOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Field,
  FilterChip,
  FilterChips,
  Input,
  SearchInput,
  Segmented,
  Select,
  SkeletonRows,
  Stat,
  StatRow,
  Tabs,
  Textarea,
  fieldClass,
} from "@/components/base";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import Modal from "@/components/ui/Modal";
import { useScrollLock } from "@/components/ui/useScrollLock";
import { toast } from "@/components/Toast";
import { formatApiError } from "@/lib/erp-api";
import {
  FILTROS_VACIOS,
  LUGARES_EDITABLES,
  MOTIVO_REAPERTURA_MINIMO,
  areasDe,
  colorDeLugar,
  descuentosPendientes,
  diaDeFila,
  diaLegible,
  enlaceAprobarExtras,
  esFinDeSemana,
  esForaneo,
  esIsoValido,
  etiquetaEstado,
  etiquetaSemana,
  fechaDeIso,
  fechaHoraCorta,
  filtrarFilas,
  formatoHoras,
  formatoMinutos,
  formatoMoneda,
  formulaPagoPorHora,
  hayFiltros,
  lineasFormula,
  lunesDe,
  montosVisibles,
  normalizarTexto,
  redondear2,
  resumenCierre,
  resumenControl,
  semanaActual,
  semanaPasada,
  sumaONull,
  sumarDias,
  textoConfirmacionCierre,
  textoResultadoCierre,
  tieneFaltas,
  tonoDeLugar,
  totalesPorDia,
  type ControlSemanal,
  type DescuentoControl,
  type DiaControl,
  type DiaSemanaControl,
  type FilaControl,
  type FiltrosControl,
} from "@/lib/control-nomina";
import {
  aceptarDescuentosSugeridos,
  cerrarSemanaControl,
  deleteDescuentoControl,
  descargarControlExcel,
  fetchControlSemanal,
  patchDiaControl,
  patchFilaControl,
  postDescuentoControl,
  reabrirSemanaControl,
} from "@/lib/control-nomina-api";
import s from "./ControlNominaSemanal.module.css";

type Vista = "entradas" | "nomina";

export type ControlNominaSemanalProps = {
  token: string;
  /** Permiso de la sección (Pagos a empleados). La API tiene la última palabra. */
  canEdit?: boolean;
  /** Lleva a la pestaña «Lista» (botón del aviso tras generar los pagos). */
  onVerPagos?: () => void;
  /** Se llama cuando se generaron pagos, para refrescar la lista de la página. */
  onPagosGenerados?: () => void;
  /** Lunes inicial; por omisión, la semana pasada (la que se cierra y se paga). */
  semanaInicial?: string;
};

const cx = (...xs: Array<string | false | null | undefined>) => xs.filter(Boolean).join(" ");

const chipVars = (lugar: string | null | undefined): CSSProperties => {
  const c = colorDeLugar(lugar);
  return { "--chip-bg": c.fondo, "--chip-fg": c.texto, "--chip-border": c.borde } as CSSProperties;
};

const LEYENDA = ["Oficina", "Foráneo", "Descanso", "Guardia", "Vacaciones", "Falta justificada", "Falta"];

/**
 * «Control semanal» de Pagos a empleados: el sistema arma la semana (checadas, lugar del
 * día, viáticos, extras, faltas) y nómina revisa, ajusta lo excepcional y cierra. Cerrar
 * genera los pagos en Borrador. Dos vistas: «Entradas y salidas» y «Nómina», como sus
 * dos Excel.
 */
export default function ControlNominaSemanal({
  token,
  canEdit = false,
  onVerPagos,
  onPagosGenerados,
  semanaInicial,
}: ControlNominaSemanalProps) {
  const [semana, setSemana] = useState(() =>
    semanaInicial && esIsoValido(semanaInicial) ? lunesDe(semanaInicial) : semanaPasada(),
  );
  const [cargado, setCargado] = useState<{ semana: string; datos: ControlSemanal } | null>(null);
  const [cargando, setCargando] = useState(false);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>("entradas");
  const [filtros, setFiltros] = useState<FiltrosControl>(FILTROS_VACIOS);
  const qDiferida = useDeferredValue(filtros.q);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState("");
  const [excelBusy, setExcelBusy] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [reabrir, setReabrir] = useState<{ motivo: string; error: string | null; enviando: boolean } | null>(null);
  const [descuentosDe, setDescuentosDe] = useState<number | null>(null);
  const pedido = useRef(0);

  const cargar = useCallback(
    async (sem: string, silencioso = false) => {
      if (!token) {
        setError("Tu sesión no tiene un token válido. Vuelve a iniciar sesión para ver el control.");
        return;
      }
      const id = ++pedido.current;
      if (silencioso) setRefrescando(true);
      else setCargando(true);
      setError(null);
      try {
        const datos = await fetchControlSemanal(token, sem);
        if (id === pedido.current) setCargado({ semana: sem, datos });
      } catch (e) {
        if (id === pedido.current) setError(formatApiError(e, "No se pudo cargar el control de la semana"));
      } finally {
        if (id === pedido.current) {
          setCargando(false);
          setRefrescando(false);
        }
      }
    },
    [token],
  );

  useEffect(() => {
    void cargar(semana);
  }, [semana, cargar]);

  // Al cambiar de semana se cierra lo que estuviera abierto de la anterior.
  useEffect(() => {
    setDescuentosDe(null);
    setReabrir(null);
  }, [semana]);

  const vigente = cargado && cargado.semana === semana ? cargado.datos : null;
  const estado = vigente ? etiquetaEstado(vigente.semana) : null;
  const cerrada = estado?.estado === "cerrado";
  const verMontos = vigente ? montosVisibles(vigente) : true;
  const permisos = vigente?.permisos;
  const puedeEditar = Boolean(canEdit && verMontos && (permisos?.editar ?? true) && !cerrada);
  const puedeCerrar = Boolean(canEdit && verMontos && (permisos?.cerrar ?? permisos?.editar ?? true) && !cerrada);
  const puedeReabrir = Boolean(canEdit && verMontos && (permisos?.reabrir ?? permisos?.editar ?? true) && cerrada);

  const filas = useMemo(() => vigente?.filas ?? [], [vigente]);
  const dias = vigente?.dias ?? [];
  const inicio = vigente?.semana.inicio ?? semana;
  const fin = vigente?.semana.fin ?? sumarDias(semana, 6);
  const filtrosEfectivos = useMemo(() => ({ ...filtros, q: qDiferida }), [filtros, qDiferida]);
  const visibles = useMemo(() => filtrarFilas(filas, filtrosEfectivos), [filas, filtrosEfectivos]);
  const resumen = useMemo(() => resumenControl(visibles), [visibles]);
  const areas = useMemo(() => areasDe(filas), [filas]);
  const conFaltas = useMemo(() => filas.filter(tieneFaltas).length, [filas]);
  const foraneos = useMemo(() => filas.filter(esForaneo).length, [filas]);
  const lineas = useMemo(() => (vigente ? lineasFormula(vigente.formula) : []), [vigente]);
  const filaDescuentos = descuentosDe != null ? filas.find((f) => f.userId === descuentosDe) ?? null : null;
  const etiqueta = etiquetaSemana(semana);
  const hoyLunes = semanaActual();
  const pasada = semanaPasada();

  /** Corre un cambio, recarga la semana (la API recalcula todo) y avisa si falla. */
  const mutar = async (clave: string, fn: () => Promise<unknown>, falla: string, exito?: string): Promise<boolean> => {
    if (!token) return false;
    setOcupado(clave);
    try {
      await fn();
      if (exito) {
        toast.success(exito);
        setAnuncio(exito);
      }
      await cargar(semana, true);
      return true;
    } catch (e) {
      toast.error(formatApiError(e, falla));
      return false;
    } finally {
      setOcupado(null);
    }
  };

  const cambiarLugar = (fila: FilaControl, dia: DiaSemanaControl, lugar: string | null) =>
    mutar(
      `dia:${fila.userId}:${dia.fecha}`,
      () => patchDiaControl(token, { semana, userId: fila.userId, fecha: dia.fecha, lugar }),
      "No se pudo cambiar el lugar del día",
    ).then((ok) => {
      if (ok) setAnuncio(`${fila.nombre}, ${diaLegible(dia)}: ${lugar ? `${lugar} (ajuste manual)` : "vuelve a automático"}.`);
      return ok;
    });

  const guardarSueldo = (fila: FilaControl, sueldoSemanal: number) =>
    mutar(
      `sueldo:${fila.userId}`,
      () => patchFilaControl(token, { semana, userId: fila.userId, sueldoSemanal }),
      "No se pudo guardar el sueldo",
      `Sueldo semanal de ${fila.nombre} actualizado. El cambio queda registrado en su perfil.`,
    );

  const guardarNota = (fila: FilaControl, nota: string) =>
    mutar(
      `nota:${fila.userId}`,
      () => patchFilaControl(token, { semana, userId: fila.userId, notaFila: nota.trim() ? nota.trim() : null }),
      "No se pudo guardar la nota",
    );

  const agregarDescuento = (fila: FilaControl, concepto: string, monto: number) =>
    mutar(
      `desc:${fila.userId}`,
      () => postDescuentoControl(token, { semana, userId: fila.userId, concepto, monto }),
      "No se pudo agregar el descuento",
      "Descuento agregado",
    );

  const quitarDescuento = (fila: FilaControl, d: DescuentoControl) =>
    mutar(
      `desc:${fila.userId}`,
      () => deleteDescuentoControl(token, d.id),
      "No se pudo quitar el descuento",
      "Descuento quitado",
    );

  const aceptarSugeridos = (fila: FilaControl) =>
    mutar(
      `desc:${fila.userId}`,
      () => aceptarDescuentosSugeridos(token, { semana, userId: fila.userId }),
      "No se pudieron aceptar los descuentos sugeridos",
      "Descuentos sugeridos aceptados",
    );

  const bajarExcel = async () => {
    if (!token) return;
    setExcelBusy(true);
    try {
      await descargarControlExcel(token, semana);
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo descargar el Excel"));
    } finally {
      setExcelBusy(false);
    }
  };

  const pedirCierre = () => {
    const previsto = resumenCierre(filas);
    setConfirm({
      title: "Cerrar semana y generar pagos",
      message: textoConfirmacionCierre(previsto, etiqueta),
      confirmLabel:
        previsto.pagos === 0 ? "Cerrar semana" : `Cerrar y generar ${previsto.pagos === 1 ? "1 pago" : `${previsto.pagos} pagos`}`,
      danger: false,
      fn: async () => {
        try {
          const res = await cerrarSemanaControl(token, semana);
          const msg = textoResultadoCierre(res, previsto);
          toast.success({ message: msg, action: onVerPagos ? { label: "Ver pagos", onClick: onVerPagos } : undefined });
          setAnuncio(msg);
          onPagosGenerados?.();
        } catch (e) {
          toast.error(formatApiError(e, "No se pudo cerrar la semana"));
        }
        await cargar(semana, true);
      },
    });
  };

  const enviarReapertura = async () => {
    if (!reabrir) return;
    const motivo = reabrir.motivo.trim();
    if (motivo.length < MOTIVO_REAPERTURA_MINIMO) {
      setReabrir({ ...reabrir, error: `Explica el motivo (mínimo ${MOTIVO_REAPERTURA_MINIMO} caracteres).` });
      return;
    }
    setReabrir({ ...reabrir, enviando: true, error: null });
    try {
      await reabrirSemanaControl(token, semana, motivo);
      setReabrir(null);
      toast.success("Semana reabierta: vuelve a Borrador y se puede corregir.");
      setAnuncio("Semana reabierta.");
      await cargar(semana, true);
    } catch (e) {
      setReabrir((r) => (r ? { ...r, enviando: false, error: formatApiError(e, "No se pudo reabrir la semana") } : r));
    }
  };

  const limpiarFiltros = () => setFiltros(FILTROS_VACIOS);
  const filtrosPuestos = hayFiltros(filtros);

  /* ── Contenido de la tarjeta ──────────────────────────────────────────── */
  let contenido: ReactNode;
  if (!vigente && error) {
    contenido = (
      <EmptyState
        tone="danger"
        icon={<EventBusyOutlinedIcon />}
        title="No se pudo cargar la semana"
        description={error}
        action={
          <Button size="sm" onClick={() => void cargar(semana)}>
            Reintentar
          </Button>
        }
      />
    );
  } else if (!vigente) {
    contenido = <SkeletonRows rows={8} label="Cargando el control de la semana" />;
  } else if (filas.length === 0) {
    contenido = (
      <EmptyState
        tone="neutral"
        icon={<EventBusyOutlinedIcon />}
        title="Nadie en esta semana"
        description={`No hay personas activas con nómina a tu alcance en la semana ${etiqueta}.`}
      />
    );
  } else if (visibles.length === 0) {
    contenido = (
      <EmptyState
        tone="neutral"
        title="Nadie coincide con los filtros"
        description="Prueba con otra búsqueda o quita los filtros."
        action={
          <Button size="sm" onClick={limpiarFiltros}>
            Limpiar filtros
          </Button>
        }
      />
    );
  } else if (vista === "entradas") {
    contenido = <TablaEntradas dias={dias} filas={visibles} />;
  } else {
    contenido = (
      <TablaNomina
        dias={dias}
        filas={visibles}
        inicio={inicio}
        fin={fin}
        verMontos={verMontos}
        editable={puedeEditar}
        ocupado={ocupado}
        onLugar={cambiarLugar}
        onSueldo={guardarSueldo}
        onNota={guardarNota}
        onDescuentos={(f) => setDescuentosDe(f.userId)}
      />
    );
  }

  return (
    <div className={s.root}>
      {/* ── Semana: navegación, estado y acciones ─────────────────────────── */}
      <div className={s.weekBar}>
        <div className={s.weekNav} role="group" aria-label="Elegir semana">
          <Button
            variant="secondary"
            size="sm"
            icon
            aria-label="Semana anterior"
            title="Semana anterior"
            onClick={() => setSemana(sumarDias(semana, -7))}
          >
            <ChevronLeftIcon fontSize="small" />
          </Button>
          <div className={s.weekLabel}>
            <span className={s.weekEyebrow}>Semana · lunes a domingo</span>
            <strong className={s.weekTitle} aria-live="polite">
              {etiqueta}
            </strong>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon
            aria-label="Semana siguiente"
            title={semana >= hoyLunes ? "Ya estás en la semana en curso" : "Semana siguiente"}
            disabled={semana >= hoyLunes}
            onClick={() => setSemana(sumarDias(semana, 7))}
          >
            <ChevronRightIcon fontSize="small" />
          </Button>
          <Segmented
            ariaLabel="Semanas rápidas"
            value={semana === pasada ? "pasada" : semana === hoyLunes ? "actual" : null}
            onChange={(id) => setSemana(id === "pasada" ? pasada : hoyLunes)}
            items={[
              { id: "pasada", label: "Semana pasada" },
              { id: "actual", label: "Esta semana" },
            ]}
          />
          <input
            type="date"
            className={cx(fieldClass, s.datePick)}
            aria-label="Ir a la semana de una fecha"
            title="Ir a la semana de una fecha"
            value={semana}
            max={sumarDias(hoyLunes, 6)}
            onChange={(e) => {
              if (esIsoValido(e.target.value)) setSemana(lunesDe(e.target.value));
            }}
          />
        </div>

        {estado ? (
          <div className={s.weekState}>
            <Badge tone={estado.tone} dot>
              {estado.label}
            </Badge>
            {estado.detalle ? <span>{estado.detalle}</span> : null}
            {refrescando ? <span className={s.refreshing}>Actualizando…</span> : null}
          </div>
        ) : null}

        <div className={s.weekActions}>
          <Button
            variant="secondary"
            iconStart={<FileDownloadOutlinedIcon fontSize="small" />}
            loading={excelBusy}
            disabled={!vigente || filas.length === 0}
            onClick={() => void bajarExcel()}
          >
            Descargar Excel
          </Button>
          {puedeReabrir ? (
            <Button
              variant="secondary"
              iconStart={<LockOpenOutlinedIcon fontSize="small" />}
              onClick={() => setReabrir({ motivo: "", error: null, enviando: false })}
            >
              Reabrir
            </Button>
          ) : null}
          {puedeCerrar ? (
            <Button
              variant="primary"
              iconStart={<LockOutlinedIcon fontSize="small" />}
              disabled={!vigente || filas.length === 0 || refrescando || ocupado !== null}
              onClick={pedirCierre}
            >
              Cerrar semana y generar pagos
            </Button>
          ) : null}
        </div>
      </div>

      {/* ── Avisos ─────────────────────────────────────────────────────────── */}
      {error && vigente ? (
        <Alert
          tone="danger"
          role="alert"
          onDismiss={() => setError(null)}
          action={
            <Button size="sm" onClick={() => void cargar(semana, true)}>
              Reintentar
            </Button>
          }
        >
          {error} Se muestra la última versión que cargó.
        </Alert>
      ) : null}
      {vigente && !verMontos ? (
        <Alert tone="info" title="Montos ocultos">
          Con tu acceso ves las horas y el lugar de cada día, sin sueldos ni importes. Los montos los ve quien tiene
          Pagos a empleados.
        </Alert>
      ) : null}
      {vigente && cerrada ? (
        <Alert
          tone="success"
          icon={<LockOutlinedIcon fontSize="small" />}
          title="Semana cerrada"
          action={
            onVerPagos ? (
              <Button size="sm" onClick={onVerPagos}>
                Ver pagos
              </Button>
            ) : undefined
          }
        >
          {estado?.detalle ? `${estado.detalle}. ` : ""}Ya no se edita; sus pagos en Borrador están en la pestaña «Lista».
          {puedeReabrir ? " Si hay que corregir algo, reábrela." : ""}
        </Alert>
      ) : null}

      {/* ── Resumen ────────────────────────────────────────────────────────── */}
      {vigente && filas.length > 0 ? (
        <StatRow variant="strip" ariaLabel="Resumen de la semana">
          <Stat
            density="compact"
            label="Personas"
            value={resumen.personas}
            hint={filtrosPuestos ? `de ${filas.length} en la semana` : "en la semana"}
          />
          <Stat density="compact" label="Horas" value={formatoHoras(resumen.horas)} hint="de entrada a salida" />
          {verMontos ? (
            <>
              <Stat
                density="compact"
                label="Total a pagar"
                value={formatoMoneda(resumen.total)}
                tone="brand"
                hint="subtotal − descuentos"
              />
              <Stat density="compact" label="Viáticos" value={formatoMoneda(resumen.viaticos)} hint="aprobados y pagados" />
              <Stat
                density="compact"
                label="Extras"
                value={formatoMoneda(resumen.extras)}
                hint={
                  resumen.extrasMinutosPendientes
                    ? `${formatoMinutos(resumen.extrasMinutosPendientes)} por aprobar`
                    : `${formatoMinutos(resumen.extrasMinutosAprobados)} aprobadas`
                }
              />
            </>
          ) : (
            <Stat density="compact" label="Foráneos" value={resumen.personasForaneas} hint="con algún día foráneo" />
          )}
          <Stat
            density="compact"
            label="Faltas"
            value={resumen.faltas}
            tone={resumen.faltasInjustificadas ? "warning" : "default"}
            hint={`${resumen.faltasInjustificadas} sin justificar · ${resumen.personasConFalta} ${resumen.personasConFalta === 1 ? "persona" : "personas"}`}
          />
        </StatRow>
      ) : null}

      {vigente ? (
        <details className={s.howto}>
          <summary>Cómo se calcula</summary>
          {lineas.length ? (
            <dl className={s.howtoList}>
              {lineas.map((l) =>
                l.etiqueta ? (
                  <Fragment key={l.clave}>
                    <dt>{l.etiqueta}</dt>
                    <dd>{l.texto}</dd>
                  </Fragment>
                ) : (
                  <dd key={l.clave} style={{ gridColumn: "1 / -1" }}>
                    {l.texto}
                  </dd>
                ),
              )}
            </dl>
          ) : (
            <p className={s.howtoNote}>El servidor todavía no mandó las fórmulas de esta semana.</p>
          )}
          {!lineas.some((l) => l.clave === "lugar") ? (
            <p className={s.howtoNote}>
              Lugar del día: sale solo de las checadas (geocerca de la oficina = Oficina; sitio de una actividad, fuera
              de sitio, ciudad fuera de Puebla o viático de hospedaje = Foráneo), guardias, justificaciones y permisos.
              Se corrige a mano por celda y queda marcado como ajuste manual.
            </p>
          ) : null}
          <p className={s.howtoNote}>
            Horas = salida − entrada en bruto (con la comida dentro), como en el Excel: 10:00 → 18:00 = 8.00. Los
            descuentos sugeridos por faltas no se restan hasta que alguien los acepta.
          </p>
          <div className={s.legend} role="list" aria-label="Colores de lugar">
            {LEYENDA.map((l) => (
              <span key={l} role="listitem" className={s.chip} style={chipVars(l)}>
                {l}
              </span>
            ))}
          </div>
        </details>
      ) : null}

      {/* ── Tabla ──────────────────────────────────────────────────────────── */}
      <section className={s.card} aria-label="Control de la semana" aria-busy={cargando || undefined}>
        <div className={s.cardTabs}>
          <Tabs
            ariaLabel="Vista del control semanal"
            value={vista}
            onChange={setVista}
            items={[
              { id: "entradas", label: "Entradas y salidas" },
              { id: "nomina", label: "Nómina" },
            ]}
          />
        </div>
        {vigente && filas.length > 0 ? (
          <div className={s.toolbar} role="search" aria-label="Filtros del control">
            <div className={s.toolbarSearch}>
              <SearchInput
                placeholder="Buscar persona"
                aria-label="Buscar persona"
                value={filtros.q}
                onChange={(e) => setFiltros((f) => ({ ...f, q: e.target.value }))}
              />
            </div>
            {areas.length > 0 ? (
              <Select
                aria-label="Área"
                wrapperClassName={s.toolbarArea}
                value={filtros.area}
                onChange={(e) => setFiltros((f) => ({ ...f, area: e.target.value }))}
              >
                <option value="">Todas las áreas</option>
                {areas.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </Select>
            ) : null}
            <FilterChips ariaLabel="Filtros rápidos">
              <FilterChip
                active={filtros.soloFaltas}
                dot="warning"
                count={conFaltas}
                onClick={() => setFiltros((f) => ({ ...f, soloFaltas: !f.soloFaltas }))}
              >
                Solo con faltas
              </FilterChip>
              <FilterChip
                active={filtros.soloForaneos}
                dot="info"
                count={foraneos}
                onClick={() => setFiltros((f) => ({ ...f, soloForaneos: !f.soloForaneos }))}
              >
                Solo foráneos
              </FilterChip>
            </FilterChips>
            {filtrosPuestos ? (
              <Button variant="ghost" size="sm" onClick={limpiarFiltros}>
                Limpiar filtros
              </Button>
            ) : null}
            <span className={s.toolbarEnd}>
              {visibles.length === filas.length
                ? `${filas.length} ${filas.length === 1 ? "persona" : "personas"}`
                : `${visibles.length} de ${filas.length} personas`}
            </span>
          </div>
        ) : null}
        <div className={s.cardBody}>{contenido}</div>
      </section>

      <div className="ui-sr-only" aria-live="polite">
        {anuncio}
      </div>

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} danger={false} />

      <Modal
        open={reabrir !== null}
        onClose={() => (reabrir?.enviando ? undefined : setReabrir(null))}
        title="Reabrir semana"
        description={`La semana ${etiqueta} vuelve a Borrador para corregirla. Queda registrado quién la reabrió y por qué. Revisa los pagos en Borrador que ya se generaron antes de volver a cerrarla.`}
        size="sm"
        dirty={Boolean(reabrir?.motivo.trim())}
        footer={
          <>
            <Button variant="ghost" onClick={() => setReabrir(null)} disabled={reabrir?.enviando}>
              Cancelar
            </Button>
            <Button variant="primary" loading={reabrir?.enviando} onClick={() => void enviarReapertura()}>
              Reabrir semana
            </Button>
          </>
        }
      >
        <div className={s.reason}>
          <Field label="Motivo" required error={reabrir?.error ?? null} hint={`Mínimo ${MOTIVO_REAPERTURA_MINIMO} caracteres.`}>
            <Textarea
              rows={3}
              maxLength={300}
              value={reabrir?.motivo ?? ""}
              placeholder="Ej.: faltó aplicar el viático de hospedaje de Juan"
              onChange={(e) => setReabrir((r) => (r ? { ...r, motivo: e.target.value, error: null } : r))}
            />
          </Field>
          <span className={s.reasonCount}>{(reabrir?.motivo ?? "").trim().length} / 300</span>
        </div>
      </Modal>

      {filaDescuentos ? (
        <PanelDescuentos
          fila={filaDescuentos}
          etiquetaSemana={etiqueta}
          editable={puedeEditar}
          cerrada={cerrada}
          ocupado={ocupado === `desc:${filaDescuentos.userId}`}
          onCerrar={() => setDescuentosDe(null)}
          onAgregar={(c, m) => agregarDescuento(filaDescuentos, c, m)}
          onQuitar={(d) => quitarDescuento(filaDescuentos, d)}
          onAceptar={() => aceptarSugeridos(filaDescuentos)}
        />
      ) : null}
    </div>
  );
}

/* ═══ Vista «Entradas y salidas» ══════════════════════════════════════════ */

function EncabezadoDia({ dia }: { dia: DiaSemanaControl }) {
  return (
    <span className={s.dayHead}>
      <span className={s.dayName}>{dia.nombre}</span>
      <span className={s.dayNum}>{dia.numero}</span>
    </span>
  );
}

function CeldaNombre({ fila }: { fila: FilaControl }) {
  return (
    <th scope="row" className={cx(s.stickyStart, s.nameCell)}>
      <span className={s.name}>{fila.nombre}</span>
      {fila.area || fila.puesto ? <span className={s.nameMeta}>{fila.area ?? fila.puesto}</span> : null}
    </th>
  );
}

function TablaEntradas({ dias, filas }: { dias: DiaSemanaControl[]; filas: FilaControl[] }) {
  const tot = totalesPorDia(filas, dias);
  return (
    <div
      className={s.scroller}
      role="region"
      tabIndex={0}
      aria-label="Entradas y salidas: tabla con desplazamiento horizontal"
    >
      <table className={s.table}>
        <caption className="ui-sr-only">
          Entrada, salida y horas de cada persona por día de la semana. Las faltas dicen «Sin checada».
        </caption>
        <thead>
          <tr className={s.headRow1}>
            <th scope="col" rowSpan={2} className={cx(s.stickyStart, s.nameCell)}>
              Nombre
            </th>
            {dias.map((d) => (
              <th key={d.fecha} scope="colgroup" colSpan={3} className={cx(s.dayStart, esFinDeSemana(d.fecha) && s.finde)}>
                <EncabezadoDia dia={d} />
              </th>
            ))}
            <th scope="col" rowSpan={2} className={cx(s.stickyEnd, s.totalCol)}>
              Horas
              <br />
              semana
            </th>
          </tr>
          <tr className={s.headRow2}>
            {dias.map((d) => {
              const finde = esFinDeSemana(d.fecha) && s.finde;
              return (
                <Fragment key={d.fecha}>
                  <th scope="col" className={cx(s.dayStart, finde)}>
                    Entrada
                  </th>
                  <th scope="col" className={cx(finde)}>
                    Salida
                  </th>
                  <th scope="col" className={cx(finde)}>
                    Horas
                  </th>
                </Fragment>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.userId}>
              <CeldaNombre fila={f} />
              {dias.map((d) => (
                <CeldasEntrada key={d.fecha} dia={diaDeFila(f, d.fecha)} fecha={d.fecha} />
              ))}
              <td className={cx(s.stickyEnd, s.totalCol)}>{formatoHoras(f.horasTotales)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className={cx(s.stickyStart, s.nameCell)}>
              Total · {filas.length} {filas.length === 1 ? "persona" : "personas"}
            </th>
            {dias.map((d, i) => {
              const finde = esFinDeSemana(d.fecha) && s.finde;
              return (
                <Fragment key={d.fecha}>
                  <td colSpan={2} className={cx(s.dayStart, s.time, finde)}>
                    {tot.faltas[i] ? (
                      <span className={s.warnText}>
                        {tot.faltas[i]} {tot.faltas[i] === 1 ? "falta" : "faltas"}
                      </span>
                    ) : null}
                  </td>
                  <td className={cx(s.hours, finde)}>{formatoHoras(tot.horas[i])}</td>
                </Fragment>
              );
            })}
            <td className={cx(s.stickyEnd, s.totalCol)}>{formatoHoras(tot.total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function CeldasEntrada({ dia, fecha }: { dia: DiaControl | undefined; fecha: string }) {
  const finde = esFinDeSemana(fecha) && s.finde;
  if (dia?.falta) {
    const tono = tonoDeLugar(dia.lugar);
    return (
      <td colSpan={3} className={cx(s.dayStart, s.falta)}>
        Sin checada
        {dia.lugar && tono !== "falta" ? <span className={s.faltaSub}>{dia.lugar}</span> : null}
      </td>
    );
  }
  const abierta = Boolean(dia?.entrada && !dia?.salida);
  return (
    <>
      <td className={cx(s.dayStart, s.time, finde)}>{dia?.entrada ?? ""}</td>
      <td className={cx(s.time, finde, abierta && s.open)} title={abierta ? "Sin salida registrada" : undefined}>
        {dia?.salida ?? (abierta ? "—" : "")}
        {abierta ? <span className="ui-sr-only">sin salida registrada</span> : null}
      </td>
      <td className={cx(s.hours, finde, !dia?.horas && s.zero)}>{formatoHoras(dia?.horas ?? 0)}</td>
    </>
  );
}

/* ═══ Vista «Nómina» ══════════════════════════════════════════════════════ */

type TablaNominaProps = {
  dias: DiaSemanaControl[];
  filas: FilaControl[];
  inicio: string;
  fin: string;
  verMontos: boolean;
  editable: boolean;
  ocupado: string | null;
  onLugar: (fila: FilaControl, dia: DiaSemanaControl, lugar: string | null) => Promise<boolean>;
  onSueldo: (fila: FilaControl, sueldo: number) => Promise<boolean>;
  onNota: (fila: FilaControl, nota: string) => Promise<boolean>;
  onDescuentos: (fila: FilaControl) => void;
};

function TablaNomina({ dias, filas, inicio, fin, verMontos, editable, ocupado, onLugar, onSueldo, onNota, onDescuentos }: TablaNominaProps) {
  const r = resumenControl(filas);
  const tot = totalesPorDia(filas, dias);
  const oculto = <span className={s.muted}>—</span>;
  return (
    <div className={s.scroller} role="region" tabIndex={0} aria-label="Nómina de la semana: tabla con desplazamiento horizontal">
      <table className={s.table}>
        <caption className="ui-sr-only">
          Nómina de la semana por persona: lugar de cada día, horas, sueldo, pago por hora, viáticos, extras, subtotal,
          descuentos, total y nota.
        </caption>
        <thead>
          <tr className={s.headRow1}>
            <th scope="col" className={cx(s.stickyStart, s.nameCell)}>
              Nombre
            </th>
            {dias.map((d) => (
              <th key={d.fecha} scope="col" className={cx(s.dayStart, esFinDeSemana(d.fecha) && s.finde)}>
                <EncabezadoDia dia={d} />
              </th>
            ))}
            <th scope="col" className={s.dayStart}>
              Horas
              <br />
              totales
            </th>
            <th scope="col">Sueldo</th>
            <th scope="col">
              Pago
              <br />x hora
            </th>
            <th scope="col">Viáticos</th>
            <th scope="col">
              Área /
              <br />
              actividad
            </th>
            <th scope="col">
              Extras /
              <br />
              pendiente
            </th>
            <th scope="col">Subtotal</th>
            <th scope="col">Descuentos</th>
            <th scope="col" className={cx(s.stickyEnd, s.totalCol)}>
              Total
            </th>
            <th scope="col" className={s.noteCell}>
              Nota
            </th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const pend = descuentosPendientes(f);
            return (
              <tr key={f.userId}>
                <CeldaNombre fila={f} />
                {dias.map((d, i) => {
                  const dia = diaDeFila(f, d.fecha);
                  return (
                    <td key={d.fecha} className={cx(s.dayCell, i === 0 && s.dayStart, esFinDeSemana(d.fecha) && s.finde)}>
                      <span className={s.chipWrap}>
                        <ChipLugar
                          dia={dia}
                          diaSemana={d}
                          fila={f}
                          editable={editable}
                          ocupado={ocupado === `dia:${f.userId}:${d.fecha}`}
                          onElegir={(lugar) => void onLugar(f, d, lugar)}
                        />
                        {dia && dia.horas > 0 ? <span className={s.dayHours}>{formatoHoras(dia.horas)} h</span> : null}
                      </span>
                    </td>
                  );
                })}
                <td className={cx(s.num, s.dayStart, s.money)}>{formatoHoras(f.horasTotales)}</td>
                <td className={s.num}>
                  {verMontos ? (
                    <CeldaSueldo fila={f} editable={editable} ocupado={ocupado === `sueldo:${f.userId}`} onGuardar={(n) => onSueldo(f, n)} />
                  ) : (
                    oculto
                  )}
                </td>
                <td className={s.num}>
                  {verMontos ? (
                    <span className={s.cellStack}>
                      <Tip texto={formulaPagoPorHora(f)}>{formatoMoneda(f.pagoPorHora)}</Tip>
                      <span className={s.meta}>÷ {formatoHoras(f.divisorHoras ?? 48)} h</span>
                    </span>
                  ) : (
                    oculto
                  )}
                </td>
                <td className={s.num}>{verMontos ? <CeldaViaticos fila={f} /> : oculto}</td>
                <td className={s.areaCell}>{f.area ?? <span className={s.muted}>—</span>}</td>
                <td className={s.num}>
                  <CeldaExtras fila={f} verMontos={verMontos} inicio={inicio} fin={fin} />
                </td>
                <td className={cx(s.num, s.money)}>{verMontos ? formatoMoneda(f.subtotal) : oculto}</td>
                <td className={s.num}>
                  {verMontos ? (
                    <span className={s.cellStack}>
                      <button
                        type="button"
                        className={s.cellLink}
                        aria-haspopup="dialog"
                        aria-label={`Descuentos de ${f.nombre}: ${formatoMoneda(f.descuentosTotal ?? 0)}${pend.length ? `, ${pend.length} ${pend.length === 1 ? "sugerido" : "sugeridos"} por aceptar` : ""}. Abrir el detalle`}
                        onClick={() => onDescuentos(f)}
                      >
                        {f.descuentosTotal ? `−${formatoMoneda(f.descuentosTotal)}` : formatoMoneda(0)}
                      </button>
                      {pend.length ? (
                        <span className={cx(s.meta, s.warnText)}>{pend.length} por aceptar</span>
                      ) : f.descuentos.length ? (
                        <span className={s.meta}>
                          {f.descuentos.length} {f.descuentos.length === 1 ? "renglón" : "renglones"}
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    oculto
                  )}
                </td>
                <td className={cx(s.stickyEnd, s.totalCol)}>
                  {verMontos ? (
                    <span className={s.cellStack}>
                      <span>{formatoMoneda(f.total)}</span>
                      {f.pagoId != null ? <span className={s.meta}>Pago #{f.pagoId}</span> : null}
                    </span>
                  ) : (
                    oculto
                  )}
                </td>
                <td className={s.noteCell}>
                  <CeldaNota fila={f} editable={editable} ocupado={ocupado === `nota:${f.userId}`} onGuardar={(t) => onNota(f, t)} />
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className={cx(s.stickyStart, s.nameCell)}>
              Total · {filas.length} {filas.length === 1 ? "persona" : "personas"}
            </th>
            {dias.map((d, i) => (
              <td key={d.fecha} className={cx(s.dayCell, i === 0 && s.dayStart, esFinDeSemana(d.fecha) && s.finde)}>
                {tot.faltas[i] ? (
                  <span className={cx(s.meta, s.warnText)}>
                    {tot.faltas[i]} {tot.faltas[i] === 1 ? "falta" : "faltas"}
                  </span>
                ) : null}
              </td>
            ))}
            <td className={cx(s.num, s.dayStart)}>{formatoHoras(r.horas)}</td>
            <td className={s.num}>
              {verMontos ? (
                <span className={s.cellStack}>
                  <span>{formatoMoneda(r.sueldoPeriodo)}</span>
                  <span className={s.meta}>del periodo</span>
                </span>
              ) : null}
            </td>
            <td />
            <td className={s.num}>{verMontos ? formatoMoneda(r.viaticos) : null}</td>
            <td />
            <td className={s.num}>
              <span className={s.cellStack}>
                {verMontos ? <span>{formatoMoneda(r.extras)}</span> : <span>{formatoMinutos(r.extrasMinutosAprobados)}</span>}
                {r.extrasMinutosPendientes ? (
                  <span className={cx(s.meta, s.warnText)}>{formatoMinutos(r.extrasMinutosPendientes)} pendiente</span>
                ) : null}
              </span>
            </td>
            <td className={s.num}>{verMontos ? formatoMoneda(r.subtotal) : null}</td>
            <td className={s.num}>{verMontos ? (r.descuentos ? `−${formatoMoneda(r.descuentos)}` : formatoMoneda(0)) : null}</td>
            <td className={cx(s.stickyEnd, s.totalCol)}>{verMontos ? formatoMoneda(r.total) : null}</td>
            <td className={s.noteCell} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/* ─── Chip y menú del lugar del día ───────────────────────────────────────── */

function ChipLugar({
  dia,
  diaSemana,
  fila,
  editable,
  ocupado,
  onElegir,
}: {
  dia: DiaControl | undefined;
  diaSemana: DiaSemanaControl;
  fila: FilaControl;
  editable: boolean;
  ocupado: boolean;
  onElegir: (lugar: string | null) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const lugar = dia?.lugar ?? null;
  const manual = dia?.lugarOrigen === "manual";
  const textoLugar = lugar ?? "—";
  if (!editable) {
    return (
      <span
        className={s.chip}
        style={chipVars(lugar)}
        data-manual={manual ? "true" : undefined}
        title={manual ? `Ajuste manual${dia?.ajustadoPor ? ` de ${dia.ajustadoPor}` : ""}` : undefined}
      >
        {textoLugar}
        {manual ? <span className="ui-sr-only"> (ajuste manual)</span> : null}
      </span>
    );
  }
  const horario = dia?.entrada ? `${dia.entrada}–${dia.salida ?? "sin salida"}` : dia?.falta ? "sin checada" : null;
  const ajuste = manual
    ? [dia?.ajustadoPor ? `de ${dia.ajustadoPor}` : "", dia?.ajustadoAt ? `el ${fechaHoraCorta(dia.ajustadoAt)}` : ""].filter(Boolean).join(" ")
    : "";
  return (
    <>
      <button
        type="button"
        className={s.chip}
        style={chipVars(lugar)}
        data-manual={manual ? "true" : undefined}
        aria-haspopup="menu"
        aria-expanded={anchor ? true : false}
        aria-label={`${fila.nombre}, ${diaLegible(diaSemana)}: ${lugar ?? "sin lugar"}${manual ? ", ajuste manual" : ", automático"}. Cambiar lugar`}
        // `aria-disabled` y no `disabled`: un botón enfocado que se deshabilita pierde el foco.
        aria-disabled={ocupado || undefined}
        aria-busy={ocupado || undefined}
        onClick={(e) => {
          if (ocupado) return;
          setAnchor(anchor ? null : e.currentTarget);
        }}
      >
        {textoLugar}
        {manual ? (
          <span className={s.manualMark} aria-hidden="true">
            ✎
          </span>
        ) : null}
        <span className={s.chipCaret} aria-hidden="true">
          ▾
        </span>
      </button>
      {anchor ? (
        <MenuLugar
          anchor={anchor}
          titulo={`${diaLegible(diaSemana)} · ${fila.nombre}`}
          detalle={horario}
          actual={lugar}
          manual={manual}
          ajuste={ajuste}
          onClose={() => setAnchor(null)}
          onElegir={(l) => {
            anchor.focus();
            setAnchor(null);
            onElegir(l);
          }}
        />
      ) : null}
    </>
  );
}

function MenuLugar({
  anchor,
  titulo,
  detalle,
  actual,
  manual,
  ajuste,
  onElegir,
  onClose,
}: {
  anchor: HTMLElement;
  titulo: string;
  detalle: string | null;
  actual: string | null;
  manual: boolean;
  ajuste: string;
  onElegir: (lugar: string | null) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const marcado = el.querySelector<HTMLElement>('[aria-checked="true"]');
    (marcado ?? el.querySelector<HTMLElement>('[role^="menuitem"]'))?.focus();
  }, []);
  const teclas = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? []);
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLElement);
    const ir = (n: number) => {
      e.preventDefault();
      items[(n + items.length) % items.length]?.focus();
    };
    if (e.key === "ArrowDown") ir(i + 1);
    else if (e.key === "ArrowUp") ir(i < 0 ? items.length - 1 : i - 1);
    else if (e.key === "Home") ir(0);
    else if (e.key === "End") ir(items.length - 1);
    else if (e.key === "Tab") onClose();
  };
  const esActual = (l: string) => actual != null && normalizarTexto(actual) === normalizarTexto(l);
  return (
    <CapaFlotante anchor={anchor} onClose={onClose} role="menu" ariaLabel={`Lugar: ${titulo}`} capaRef={ref} onKeyDown={teclas}>
      <p className={s.menuHead} role="presentation">
        {titulo}
        {detalle ? ` · ${detalle}` : ""}
      </p>
      {LUGARES_EDITABLES.map((l) => (
        <button
          key={l}
          type="button"
          role="menuitemradio"
          aria-checked={esActual(l)}
          tabIndex={-1}
          className={s.menuItem}
          onClick={() => onElegir(l)}
        >
          <span className={s.swatch} style={chipVars(l)} aria-hidden="true" />
          {l}
          {esActual(l) ? <CheckIcon className={s.check} fontSize="small" aria-hidden="true" /> : null}
        </button>
      ))}
      <div className={s.menuSep} role="separator" />
      {manual ? (
        <button type="button" role="menuitem" tabIndex={-1} className={s.menuItem} onClick={() => onElegir(null)}>
          Volver a automático
        </button>
      ) : null}
      <p className={s.menuNote} role="presentation">
        {manual
          ? `Ajuste manual${ajuste ? ` ${ajuste}` : ""}. «Volver a automático» deja que el sistema lo calcule otra vez.`
          : "Automático: sale de checadas, geocerca, actividades, guardias y viáticos. Elegir otro lugar lo marca como ajuste manual."}
      </p>
    </CapaFlotante>
  );
}

/* ─── Celdas editables ────────────────────────────────────────────────────── */

function CeldaSueldo({
  fila,
  editable,
  ocupado,
  onGuardar,
}: {
  fila: FilaControl;
  editable: boolean;
  ocupado: boolean;
  onGuardar: (sueldo: number) => Promise<boolean>;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  const cancelar = () => {
    setEditando(false);
    setError(null);
  };
  const guardar = async () => {
    const n = Number(valor.replace(/[$,\s]/g, ""));
    if (!valor.trim() || !Number.isFinite(n) || n < 0) {
      setError("Escribe un monto válido (0 o más).");
      return;
    }
    if (fila.sueldo != null && redondear2(n) === redondear2(fila.sueldo)) {
      cancelar();
      return;
    }
    if (await onGuardar(redondear2(n))) cancelar();
  };

  if (editando) {
    return (
      <span className={s.cellStack}>
        <span className={s.editRow}>
          <input
            className={s.inlineInput}
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={valor}
            autoFocus
            aria-label={`Sueldo semanal de ${fila.nombre}`}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(e) => {
              setValor(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void guardar();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelar();
              }
            }}
          />
          <button type="button" className={s.iconBtn} aria-label="Guardar sueldo" title="Guardar" disabled={ocupado} onClick={() => void guardar()}>
            <CheckIcon fontSize="inherit" />
          </button>
          <button type="button" className={s.iconBtn} aria-label="Cancelar" title="Cancelar" disabled={ocupado} onClick={cancelar}>
            <CloseIcon fontSize="inherit" />
          </button>
        </span>
        {error ? (
          <span id={errorId} role="alert" className={cx(s.meta, s.warnText)}>
            {error}
          </span>
        ) : (
          <span className={s.meta}>Cambia el perfil · queda registrado</span>
        )}
      </span>
    );
  }
  return (
    <span className={s.editRow}>
      <span className={s.cellStack}>
        {fila.sueldo == null ? <span className={s.warnText}>Sin sueldo</span> : <span className={s.money}>{formatoMoneda(fila.sueldo)}</span>}
        {fila.sueldoPeriodo != null && fila.sueldo != null && redondear2(fila.sueldoPeriodo) !== redondear2(fila.sueldo) ? (
          <span className={s.meta}>Periodo {formatoMoneda(fila.sueldoPeriodo)}</span>
        ) : (
          <span className={s.meta}>semanal</span>
        )}
      </span>
      {editable ? (
        <button
          type="button"
          className={s.iconBtn}
          aria-label={`Editar sueldo semanal de ${fila.nombre}`}
          title="Editar sueldo semanal (cambia el perfil de la persona y queda registrado)"
          disabled={ocupado}
          onClick={() => {
            setValor(fila.sueldo != null ? String(fila.sueldo) : "");
            setEditando(true);
          }}
        >
          <EditOutlinedIcon fontSize="inherit" />
        </button>
      ) : null}
    </span>
  );
}

function CeldaNota({
  fila,
  editable,
  ocupado,
  onGuardar,
}: {
  fila: FilaControl;
  editable: boolean;
  ocupado: boolean;
  onGuardar: (nota: string) => Promise<boolean>;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState("");
  const guardar = async () => {
    if (valor.trim() === (fila.notaFila ?? "").trim()) {
      setEditando(false);
      return;
    }
    if (await onGuardar(valor)) setEditando(false);
  };
  if (editando) {
    return (
      <div className={s.noteEdit}>
        <textarea
          className={s.noteArea}
          value={valor}
          maxLength={500}
          autoFocus
          aria-label={`Nota de ${fila.nombre}`}
          placeholder="* Toda la semana asignado a …"
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setEditando(false);
            } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void guardar();
            }
          }}
        />
        <div className={s.noteActions}>
          <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => setEditando(false)}>
            Cancelar
          </Button>
          <Button size="sm" variant="tonal" loading={ocupado} onClick={() => void guardar()}>
            Guardar
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className={s.noteRow}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {fila.notaFila ? (
          <>
            <span className={s.noteText} title={fila.notaFila}>
              {fila.notaFila}
            </span>
            {fila.notaFilaOrigen === "auto" ? <span className={s.meta}>Automática</span> : null}
          </>
        ) : (
          <span className={s.noteEmpty}>{editable ? "Sin nota" : "—"}</span>
        )}
      </div>
      {editable ? (
        <button
          type="button"
          className={s.iconBtn}
          aria-label={fila.notaFila ? `Editar nota de ${fila.nombre}` : `Agregar nota a ${fila.nombre}`}
          title={fila.notaFila ? "Editar nota (vacía = vuelve a la automática)" : "Agregar nota"}
          disabled={ocupado}
          onClick={() => {
            setValor(fila.notaFila ?? "");
            setEditando(true);
          }}
        >
          <EditOutlinedIcon fontSize="inherit" />
        </button>
      ) : null}
    </div>
  );
}

function CeldaViaticos({ fila }: { fila: FilaControl }) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  if (fila.viaticos == null) return <span className={s.muted}>—</span>;
  if (!fila.viaticosDetalle.length) return <span className={fila.viaticos ? s.money : s.zero}>{formatoMoneda(fila.viaticos)}</span>;
  const n = fila.viaticosDetalle.length;
  return (
    <span className={s.cellStack}>
      <button
        type="button"
        className={cx(s.cellLink, s.money)}
        aria-haspopup="dialog"
        aria-expanded={anchor ? true : false}
        aria-label={`Viáticos de ${fila.nombre}: ${formatoMoneda(fila.viaticos)}. Ver desglose`}
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
      >
        {formatoMoneda(fila.viaticos)}
      </button>
      <span className={s.meta}>
        {n} {n === 1 ? "solicitud" : "solicitudes"}
      </span>
      {anchor ? (
        <CapaFlotante anchor={anchor} onClose={() => setAnchor(null)} role="dialog" ariaLabel={`Desglose de viáticos de ${fila.nombre}`} enfocar>
          <p className={s.menuHead}>Viáticos de la semana · {fila.nombre}</p>
          <ul className={s.breakdown}>
            {fila.viaticosDetalle.map((v) => (
              <li key={String(v.id)}>
                <span>
                  {v.concepto}
                  <span className={s.meta}>
                    {[v.fecha ? fechaCorta(v.fecha) : "", v.estatus].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className={s.money}>{formatoMoneda(v.monto)}</span>
              </li>
            ))}
            <li className={s.breakdownTotal}>
              <span>Total</span>
              <span>{formatoMoneda(fila.viaticos)}</span>
            </li>
          </ul>
          <p className={s.menuNote}>Aprobados o pagados, por fecha de solicitud dentro de la semana.</p>
        </CapaFlotante>
      ) : null}
    </span>
  );
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function fechaCorta(iso: string): string {
  const d = fechaDeIso(iso);
  return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]}`;
}

function CeldaExtras({ fila, verMontos, inicio, fin }: { fila: FilaControl; verMontos: boolean; inicio: string; fin: string }) {
  const aprob = fila.extrasMinutosAprobados;
  const pend = fila.extrasMinutosPendientes;
  return (
    <span className={s.cellStack}>
      {verMontos ? (
        fila.extrasMonto == null ? (
          <span className={s.muted}>—</span>
        ) : (
          <span className={fila.extrasMonto ? s.money : s.zero}>{formatoMoneda(fila.extrasMonto)}</span>
        )
      ) : (
        <span className={aprob ? undefined : s.zero}>{formatoMinutos(aprob)}</span>
      )}
      {verMontos && aprob > 0 ? <span className={s.meta}>{formatoMinutos(aprob)} aprobadas</span> : null}
      {pend > 0 ? (
        <Link
          href={enlaceAprobarExtras(fila.userId, inicio, fin)}
          className={s.pendLink}
          aria-label={`${formatoMinutos(pend)} extra pendientes de ${fila.nombre}: aprobar en KPIs del equipo`}
        >
          {formatoMinutos(pend)} pendiente
          <span className={s.pendAction}>Aprobar ›</span>
        </Link>
      ) : null}
    </span>
  );
}

/* ─── Tooltip y capa flotante ─────────────────────────────────────────────── */

/** Tooltip con la fórmula: al pasar el mouse o al enfocar; el texto también va oculto para el lector. */
function Tip({ texto, children }: { texto: string; children: ReactNode }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const id = useId();
  return (
    <>
      <span
        className={cx(s.tipTarget, s.money)}
        tabIndex={0}
        aria-describedby={id}
        onMouseEnter={(e) => setAnchor(e.currentTarget)}
        onMouseLeave={() => setAnchor(null)}
        onFocus={(e) => setAnchor(e.currentTarget)}
        onBlur={() => setAnchor(null)}
      >
        {children}
      </span>
      <span id={id} className="ui-sr-only">
        {texto}
      </span>
      {anchor ? (
        <CapaFlotante anchor={anchor} onClose={() => setAnchor(null)} tip className={s.tip}>
          {texto}
        </CapaFlotante>
      ) : null}
    </>
  );
}

/**
 * Capa con posición fija pegada a su ancla (se monta en `body`): la tabla hace scroll
 * dentro de su marco y un menú absoluto se recortaría. Se voltea hacia arriba si no
 * cabe abajo, sigue al ancla al desplazar y se cierra con Escape o al tocar fuera.
 */
function CapaFlotante({
  anchor,
  onClose,
  children,
  role,
  ariaLabel,
  className,
  capaRef,
  onKeyDown,
  tip = false,
  enfocar = false,
}: {
  anchor: HTMLElement;
  onClose: () => void;
  children: ReactNode;
  role?: "menu" | "dialog";
  ariaLabel?: string;
  className?: string;
  capaRef?: MutableRefObject<HTMLDivElement | null>;
  onKeyDown?: (e: ReactKeyboardEvent<HTMLDivElement>) => void;
  tip?: boolean;
  /** Mueve el foco a la capa al abrir (desgloses que se leen con lector). */
  enfocar?: boolean;
}) {
  const local = useRef<HTMLDivElement | null>(null);
  const cerrarRef = useRef(onClose);
  cerrarRef.current = onClose;
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  const setRef = (el: HTMLDivElement | null) => {
    local.current = el;
    if (capaRef) capaRef.current = el;
  };

  useLayoutEffect(() => {
    const colocar = () => {
      const el = local.current;
      if (!el) return;
      const r = anchor.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (r.bottom < 0 || r.top > vh) {
        cerrarRef.current();
        return;
      }
      const w = el.offsetWidth;
      const h = el.scrollHeight;
      const abajo = vh - r.bottom - 12;
      const arriba = r.top - 12;
      const haciaAbajo = h <= abajo || abajo >= arriba;
      const maxHeight = Math.max(120, haciaAbajo ? abajo : arriba);
      const alto = Math.min(h, maxHeight);
      const top = haciaAbajo ? r.bottom + 4 : Math.max(8, r.top - 4 - alto);
      const left = Math.min(Math.max(8, r.left), Math.max(8, vw - w - 8));
      setPos({ top, left, maxHeight });
    };
    colocar();
    window.addEventListener("resize", colocar);
    window.addEventListener("scroll", colocar, true);
    return () => {
      window.removeEventListener("resize", colocar);
      window.removeEventListener("scroll", colocar, true);
    };
  }, [anchor]);

  useEffect(() => {
    if (enfocar) local.current?.focus();
  }, [enfocar]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (!tip) anchor.focus();
      cerrarRef.current();
    };
    const fuera = (e: MouseEvent) => {
      const t = e.target as Node;
      if (local.current?.contains(t) || anchor.contains(t)) return;
      cerrarRef.current();
    };
    document.addEventListener("keydown", tecla);
    if (!tip) document.addEventListener("mousedown", fuera);
    return () => {
      document.removeEventListener("keydown", tecla);
      document.removeEventListener("mousedown", fuera);
    };
  }, [anchor, tip]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={setRef}
      role={role}
      aria-label={ariaLabel}
      aria-hidden={tip ? true : undefined}
      tabIndex={enfocar ? -1 : undefined}
      className={cx(s.layer, className)}
      onKeyDown={onKeyDown}
      // Opacidad y no `visibility: hidden` mientras se mide: lo oculto con visibility no
      // acepta el foco, y el menú enfoca su opción marcada en ese mismo primer cuadro.
      style={{
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        maxHeight: pos?.maxHeight,
        opacity: pos ? undefined : 0,
        pointerEvents: pos ? undefined : "none",
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

/* ─── Panel lateral de descuentos ─────────────────────────────────────────── */

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function PanelDescuentos({
  fila,
  etiquetaSemana: etiqueta,
  editable,
  cerrada,
  ocupado,
  onCerrar,
  onAgregar,
  onQuitar,
  onAceptar,
}: {
  fila: FilaControl;
  etiquetaSemana: string;
  editable: boolean;
  cerrada: boolean;
  ocupado: boolean;
  onCerrar: () => void;
  onAgregar: (concepto: string, monto: number) => Promise<boolean>;
  onQuitar: (d: DescuentoControl) => Promise<boolean>;
  onAceptar: () => Promise<boolean>;
}) {
  const tituloId = useId();
  const panel = useRef<HTMLElement | null>(null);
  const cerrarRef = useRef(onCerrar);
  cerrarRef.current = onCerrar;
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  const [error, setError] = useState<string | null>(null);
  useScrollLock(true);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = panel.current;
    // El foco va al panel (el lector anuncia su título), no a «Aceptar sugeridos»:
    // un Enter por inercia no debe aplicar descuentos.
    el?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cerrarRef.current();
        return;
      }
      if (e.key !== "Tab" || !el) return;
      const nodos = el.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!nodos.length) return;
      const primero = nodos[0];
      const ultimo = nodos[nodos.length - 1];
      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    };
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("keydown", tecla);
      prev?.focus?.();
    };
  }, []);

  const pendientes = descuentosPendientes(fila);
  const sumaPendientes = sumaONull(pendientes.map((d) => d.monto));

  const agregar = async (e: FormEvent) => {
    e.preventDefault();
    const c = concepto.trim();
    const m = Number(monto.replace(/[$,\s]/g, ""));
    if (c.length < 3) {
      setError("Escribe el concepto (mínimo 3 letras).");
      return;
    }
    if (!monto.trim() || !Number.isFinite(m) || m <= 0) {
      setError("El monto debe ser mayor a $0.");
      return;
    }
    setError(null);
    if (await onAgregar(c, redondear2(m))) {
      setConcepto("");
      setMonto("");
    }
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className={s.scrim}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      <aside ref={panel} className={s.drawer} role="dialog" aria-modal="true" aria-labelledby={tituloId} tabIndex={-1}>
        <header className={s.drawerHead}>
          <div className={s.drawerTitles}>
            <h2 id={tituloId} className={s.drawerTitle}>
              Descuentos · {fila.nombre}
            </h2>
            <p className={s.drawerSub}>
              Semana {etiqueta}
              {fila.area ? ` · ${fila.area}` : ""}
            </p>
          </div>
          <button type="button" className={s.iconBtn} aria-label="Cerrar panel de descuentos" title="Cerrar" onClick={onCerrar}>
            <CloseIcon fontSize="inherit" />
          </button>
        </header>
        <div className={s.drawerBody} data-cn-body="">
          {pendientes.length ? (
            <Alert
              tone="warning"
              title="Sugeridos por faltas"
              action={
                editable ? (
                  <Button size="sm" loading={ocupado} onClick={() => void onAceptar()}>
                    {pendientes.length === 1 ? "Aceptar sugerido" : `Aceptar los ${pendientes.length}`}
                  </Button>
                ) : undefined
              }
            >
              {pendientes.length === 1 ? "Hay 1 descuento sugerido" : `Hay ${pendientes.length} descuentos sugeridos`} por faltas
              injustificadas ({formatoMoneda(sumaPendientes)}). No se restan hasta que alguien los acepte.
            </Alert>
          ) : null}

          <section>
            <h3 className={s.sectionTitle}>Renglones</h3>
            <ul className={s.lines}>
              {fila.descuentos.length === 0 ? (
                <li className={s.lineEmpty}>Sin descuentos esta semana.</li>
              ) : (
                fila.descuentos.map((d) => {
                  const pendiente = d.sugerido && d.aceptado !== true;
                  return (
                    <li key={String(d.id)} className={s.line}>
                      <span className={s.lineConcept}>
                        <span>{d.concepto}</span>
                        <Badge size="sm" tone={pendiente ? "warning" : d.sugerido ? "info" : "neutral"}>
                          {pendiente ? "Sugerido · por aceptar" : d.sugerido ? "Sugerido · aceptado" : "Manual"}
                        </Badge>
                      </span>
                      <span className={cx(s.money, pendiente && s.muted)}>
                        {d.monto != null ? `−${formatoMoneda(d.monto)}` : "—"}
                      </span>
                      {/* Una sugerencia por aceptar no resta nada ni existe en el servidor (id
                          `sugerido-AAAA-MM-DD`): no hay qué quitar; solo se acepta o se ignora. */}
                      {editable && !pendiente ? (
                        <button
                          type="button"
                          className={s.iconBtn}
                          aria-label={`Quitar el descuento «${d.concepto}»`}
                          title="Quitar"
                          disabled={ocupado}
                          onClick={() => void onQuitar(d)}
                        >
                          <DeleteOutlineIcon fontSize="inherit" />
                        </button>
                      ) : (
                        <span />
                      )}
                    </li>
                  );
                })
              )}
            </ul>
          </section>

          {editable ? (
            <form className={s.addForm} onSubmit={(e) => void agregar(e)} noValidate>
              <h3 className={s.sectionTitle} style={{ gridColumn: "1 / -1", margin: 0 }}>
                Agregar descuento
              </h3>
              <Field label="Concepto">
                <Input
                  value={concepto}
                  maxLength={120}
                  placeholder="Préstamo, uniforme, herramienta…"
                  onChange={(e) => {
                    setConcepto(e.target.value);
                    setError(null);
                  }}
                />
              </Field>
              <Field label="Monto">
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={monto}
                  iconStart="$"
                  onChange={(e) => {
                    setMonto(e.target.value);
                    setError(null);
                  }}
                />
              </Field>
              {error ? (
                <p className={s.formError} role="alert">
                  {error}
                </p>
              ) : null}
              <Button type="submit" iconStart={<AddIcon fontSize="small" />} loading={ocupado}>
                Agregar descuento
              </Button>
            </form>
          ) : (
            <p className={s.howtoNote}>
              {cerrada
                ? "La semana está cerrada: para cambiar descuentos hay que reabrirla."
                : "Solo consulta: tu acceso no permite editar descuentos."}
            </p>
          )}
        </div>
        <footer className={s.drawerFoot}>
          <span>
            Total de descuentos <strong>{formatoMoneda(fila.descuentosTotal ?? 0)}</strong>
          </span>
          <Button variant="ghost" onClick={onCerrar}>
            Cerrar
          </Button>
        </footer>
      </aside>
    </div>,
    document.body,
  );
}
