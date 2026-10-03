"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import OutboxOutlinedIcon from "@mui/icons-material/OutboxOutlined";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import TimerOffOutlinedIcon from "@mui/icons-material/TimerOffOutlined";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import CloseIcon from "@mui/icons-material/Close";
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  DataTable,
  EmptyState,
  FilterChip,
  FilterChips,
  ListFooter,
  ModuleToolbar,
  PersonCell,
  ProgressCell,
  SearchInput,
  Select,
  SkeletonRows,
  Stat,
  StatRow,
  StatusBadge,
  WhenCell,
  type Column,
} from "@/components/base";
import ActivityKindIcon from "@/components/ops/ActivityKindIcon";
import { PrioridadChip, SemaforoBadge } from "@/components/pizarra/PizarraKpi";
import { formatApiError } from "@/lib/erp-api";
import { kindIcon, kindLabel } from "@/lib/activity-labels";
import {
  SEMAFORO_LABELS,
  fetchAsignadasPorMi,
  formatMinutes,
  type AsignadaPorMiItem,
  type BoardRange,
  type Semaforo,
} from "@/lib/team-board-api";
import { SEMAFORO_TONE } from "./tonos";
import c from "./comun.module.css";
import s from "./AsignadasPorMiView.module.css";

function fecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
}

type SemaforoFilter = "todos" | Semaforo;
type TriFilter = "todos" | "si" | "no";

const SEMAFOROS: Semaforo[] = ["rojo", "amarillo", "verde"];

/** Filtra en cliente con campos que ya trae cada ítem (sin round-trip). */
export function filtrarAsignadasPorMi(
  items: readonly AsignadaPorMiItem[],
  opts: {
    semaforo: SemaforoFilter;
    excedida: TriFilter;
    terminada: TriFilter;
    personaId: number | null;
  },
): AsignadaPorMiItem[] {
  return items.filter((a) => {
    if (opts.semaforo !== "todos" && a.semaforo !== opts.semaforo) return false;
    if (opts.excedida === "si" && !a.excedida) return false;
    if (opts.excedida === "no" && a.excedida) return false;
    if (opts.terminada === "si" && !a.terminada) return false;
    if (opts.terminada === "no" && a.terminada) return false;
    if (opts.personaId != null && a.persona.id !== opts.personaId) return false;
    return true;
  });
}

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Contrato C: lo que repartió quien mira, en tabla con foto, avance y semáforo. */
export default function AsignadasPorMiView({
  token,
  rango,
  toolbarEnd,
}: {
  token: string | null;
  rango: BoardRange;
  /** Al final de la barra de la lista (p. ej. el selector de rango de la pizarra). */
  toolbarEnd?: ReactNode;
}) {
  const router = useRouter();
  const [items, setItems] = useState<AsignadaPorMiItem[]>([]);
  const [cargado, setCargado] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [semaforo, setSemaforo] = useState<SemaforoFilter>("todos");
  const [excedida, setExcedida] = useState<TriFilter>("todos");
  const [terminada, setTerminada] = useState<TriFilter>("todos");
  const [personaId, setPersonaId] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const desde = rango.desde ?? null;
  const hasta = rango.hasta ?? null;

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      setError("Inicia sesión para ver lo que asignaste.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAsignadasPorMi(token, { desde, hasta });
      setItems(Array.isArray(res?.items) ? res.items : []);
      setCargado(true);
    } catch (e) {
      // Un fallo al refrescar no borra lo que ya se veía: solo se avisa.
      setError(formatApiError(e, "No se pudo cargar lo que asignaste"));
    } finally {
      setLoading(false);
    }
  }, [token, desde, hasta]);

  useEffect(() => {
    void load();
  }, [load]);

  const personas = useMemo(() => {
    const map = new Map<number, string>();
    for (const a of items) {
      if (!map.has(a.persona.id)) map.set(a.persona.id, a.persona.nombre);
    }
    return [...map.entries()]
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [items]);

  const filtered = useMemo(() => {
    const base = filtrarAsignadasPorMi(items, { semaforo, excedida, terminada, personaId });
    const q = normalizar(busqueda);
    if (!q) return base;
    return base.filter((a) => normalizar(`${a.anNumber} ${a.titulo} ${a.persona.nombre}`).includes(q));
  }, [items, semaforo, excedida, terminada, personaId, busqueda]);

  const cuenta = useMemo(() => {
    const porSemaforo: Record<Semaforo, number> = { rojo: 0, amarillo: 0, verde: 0 };
    let excedidas = 0;
    let terminadas = 0;
    for (const a of items) {
      if (a.semaforo in porSemaforo) porSemaforo[a.semaforo] += 1;
      if (a.excedida) excedidas += 1;
      if (a.terminada) terminadas += 1;
    }
    return { porSemaforo, excedidas, terminadas };
  }, [items]);

  const hayFiltro =
    semaforo !== "todos" || excedida !== "todos" || terminada !== "todos" || personaId != null || busqueda.trim() !== "";
  const quitarFiltros = () => {
    setSemaforo("todos");
    setExcedida("todos");
    setTerminada("todos");
    setPersonaId(null);
    setBusqueda("");
  };

  const columnas: Column<AsignadaPorMiItem>[] = [
    {
      key: "actividad",
      label: "Actividad",
      render: (a) => (
        <span className={s.actividad}>
          <span className={s.tipo} aria-hidden="true">
            <ActivityKindIcon kind={kindIcon(a)} size={18} />
          </span>
          <span className={s.actividadTexto}>
            <span className={s.titulo}>{a.titulo}</span>
            <span className={s.sub}>
              <span className={c.folio}>{a.anNumber}</span> · {kindLabel(a)}
            </span>
          </span>
        </span>
      ),
    },
    {
      key: "persona",
      label: "Responsable",
      width: 200,
      render: (a) => (
        <PersonCell
          name={a.persona.nombre}
          avatarUrl={a.persona.avatarUrl}
          subtitle={a.retirado ? "Ya no está en el equipo" : a.persona.puesto ?? undefined}
        />
      ),
    },
    {
      key: "cuando",
      label: "Cuándo",
      width: 150,
      render: (a) => (
        <WhenCell
          time={`Asignada ${fecha(a.fechaAsignacion)}`}
          hint={a.periodo?.etiqueta ?? (a.fechaMaxima ? `Vence ${fecha(a.fechaMaxima)}` : undefined)}
          tone={SEMAFORO_TONE[a.semaforo] ?? "neutral"}
        />
      ),
    },
    {
      key: "tiempo",
      label: "Plan vs. real",
      width: 170,
      render: (a) =>
        a.minutosPlan && a.minutosPlan > 0 ? (
          <ProgressCell
            value={Math.min(a.minutosReales ?? 0, a.minutosPlan)}
            max={a.minutosPlan}
            tone={a.excedida ? "danger" : a.terminada ? "success" : "brand"}
            label={`${formatMinutes(a.minutosReales ?? 0)} / ${formatMinutes(a.minutosPlan)}`}
            ariaLabel={`Real ${formatMinutes(a.minutosReales)} de ${formatMinutes(a.minutosPlan)} planeados`}
            width={150}
          />
        ) : (
          <span className={c.pista}>Sin plan</span>
        ),
    },
    {
      key: "estado",
      label: "Estado",
      width: 190,
      render: (a) => (
        <span className={s.estado}>
          <StatusBadge size="sm" status={a.estatus} />
          {a.terminada ? null : <SemaforoBadge semaforo={a.semaforo} />}
          <PrioridadChip prioridad={a.prioridad} />
          {a.excedida ? (
            <StatusBadge size="sm" tone="danger" label="Excedida" dot={false} />
          ) : null}
        </span>
      ),
    },
  ];

  const total = items.length;
  const verde = cuenta.porSemaforo.verde;
  const amarillo = cuenta.porSemaforo.amarillo;
  const rojo = cuenta.porSemaforo.rojo;

  const barra = (
    <ModuleToolbar
      search={
        <SearchInput
          placeholder="Buscar folio, actividad o persona"
          aria-label="Buscar folio, actividad o persona"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      }
      chips={
        <FilterChips ariaLabel="Filtros de asignadas">
          <FilterChip active={semaforo === "todos"} count={total} onClick={() => setSemaforo("todos")}>
            Todas
          </FilterChip>
          {SEMAFOROS.map((sem) => (
            <FilterChip
              key={sem}
              active={semaforo === sem}
              count={cuenta.porSemaforo[sem]}
              dot={SEMAFORO_TONE[sem]}
              onClick={() => setSemaforo(semaforo === sem ? "todos" : sem)}
            >
              {SEMAFORO_LABELS[sem]}
            </FilterChip>
          ))}
          <FilterChip
            active={excedida === "si"}
            count={cuenta.excedidas}
            onClick={() => setExcedida((v) => (v === "si" ? "todos" : "si"))}
          >
            Excedida
          </FilterChip>
          <FilterChip
            active={terminada === "si"}
            count={cuenta.terminadas}
            onClick={() => setTerminada((v) => (v === "si" ? "todos" : "si"))}
          >
            Terminada
          </FilterChip>
        </FilterChips>
      }
      end={
        <>
          {personas.length > 1 ? (
            <Select
              aria-label="Persona"
              controlSize="sm"
              iconStart={<PersonOutlineIcon />}
              value={personaId ?? ""}
              onChange={(e) => setPersonaId(e.target.value ? Number(e.target.value) : null)}
              wrapperClassName={s.persona}
            >
              <option value="">Todas las personas</option>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          ) : null}
          {toolbarEnd}
        </>
      }
    />
  );

  let contenido: ReactNode;
  if (loading && !cargado) {
    contenido = (
      <div className={s.relleno}>
        <SkeletonRows rows={5} label="Cargando lo que asignaste" />
      </div>
    );
  } else if (error && !cargado) {
    contenido = (
      <div className={s.relleno}>
        <Alert
          tone="danger"
          role="alert"
          action={
            <Button size="sm" className={c.tap} onClick={() => void load()} loading={loading}>
              Reintentar
            </Button>
          }
        >
          {error}
        </Alert>
      </div>
    );
  } else if (total === 0) {
    contenido = (
      <EmptyState
        icon={<OutboxOutlinedIcon />}
        tone="neutral"
        titleAs="h2"
        title="No asignaste actividades en este rango"
        description="Cuando le asignes algo a tu equipo, aquí ves cómo va cada persona. Prueba con otro rango de fechas."
      />
    );
  } else {
    contenido = (
      <DataTable
        columns={columnas}
        rows={filtered}
        rowKey={(a) => `${a.id}-${a.persona.id}`}
        onRowClick={(a) => router.push(`/erp/actividades/${a.id}`)}
        rowActions={(a) => (
          <ButtonLink
            href={`/erp/pizarra/${a.persona.id}`}
            size="sm"
            variant="ghost"
            onClick={(e) => e.stopPropagation()}
            aria-label={`Ver la ficha de ${a.persona.nombre}`}
          >
            Ver ficha
          </ButtonLink>
        )}
        rowActionsLabel="Acciones"
        flush
        ariaLabel="Actividades que asignaste"
        emptyTitle="Ninguna asignación coincide con estos filtros"
        emptyAction={
          hayFiltro ? (
            <Button size="sm" iconStart={<CloseIcon />} onClick={quitarFiltros}>
              Quitar filtros
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className={s.vista}>
      {total > 0 ? (
        <StatRow cols={4} ariaLabel="Resumen de lo que asignaste">
          <Stat
            label="Asignadas"
            value={total}
            icon={<OutboxOutlinedIcon />}
            meter={[
              { value: verde, tone: "success", label: `${verde} en tiempo` },
              { value: amarillo, tone: "warning", label: `${amarillo} por vencer` },
              { value: rojo, tone: "danger", label: `${rojo} atrasadas` },
            ]}
            meterMax={total}
          />
          <Stat
            label="Atrasadas"
            value={rojo}
            tone={rojo > 0 ? "danger" : "default"}
            hint={amarillo > 0 ? `${amarillo} por vencer` : "ninguna por vencer"}
            icon={<ReportProblemOutlinedIcon />}
            iconTone={rojo > 0 ? "danger" : "neutral"}
            semaforo={rojo > 0 ? "rojo" : amarillo > 0 ? "ambar" : "verde"}
            onClick={() => setSemaforo(semaforo === "rojo" ? "todos" : "rojo")}
            pressed={semaforo === "rojo"}
          />
          <Stat
            label="Excedidas"
            value={cuenta.excedidas}
            tone={cuenta.excedidas > 0 ? "warning" : "default"}
            hint="tardaron más que su plan"
            icon={<TimerOffOutlinedIcon />}
            iconTone={cuenta.excedidas > 0 ? "warning" : "neutral"}
            onClick={() => setExcedida((v) => (v === "si" ? "todos" : "si"))}
            pressed={excedida === "si"}
          />
          <Stat
            label="Terminadas"
            value={cuenta.terminadas}
            suffix={`/ ${total}`}
            tone={cuenta.terminadas > 0 ? "brand" : "default"}
            hint="del rango elegido"
            icon={<TaskAltIcon />}
            iconTone="success"
          />
        </StatRow>
      ) : null}

      {error && cargado ? (
        <Alert
          tone="warning"
          role="status"
          action={
            <Button size="sm" className={c.tap} onClick={() => void load()} loading={loading}>
              Reintentar
            </Button>
          }
        >
          {error}. Se muestra lo último que cargó.
        </Alert>
      ) : null}

      <Card pad={false} className={s.lista}>
        {barra}
        {contenido}
        {total > 0 ? (
          <ListFooter>
            {hayFiltro ? `${filtered.length} de ${total} asignaciones` : `${total} asignaci${total === 1 ? "ón" : "ones"}`}
          </ListFooter>
        ) : null}
      </Card>
    </div>
  );
}
