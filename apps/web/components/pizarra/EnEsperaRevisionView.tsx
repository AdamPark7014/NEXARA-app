"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import RateReviewOutlinedIcon from "@mui/icons-material/RateReviewOutlined";
import HourglassBottomIcon from "@mui/icons-material/HourglassBottom";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import CelebrationOutlinedIcon from "@mui/icons-material/CelebrationOutlined";
import {
  Alert,
  Badge,
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
  SearchInput,
  SkeletonRows,
  Stat,
  StatRow,
  StatusBadge,
  WhenCell,
  type Column,
} from "@/components/base";
import ActivityKindIcon from "@/components/ops/ActivityKindIcon";
import { kindIcon, kindLabel } from "@/lib/activity-labels";
import { conOrigen, type OrigenActividad } from "@/lib/actividad-origen";
import { cuandoMx } from "@/components/pizarra/equipo-estado";
import {
  coincideBusqueda,
  decisionUi,
  minutosEsperando,
  pieRevisadas,
  textoEspera,
  tonoEspera,
  type RevisionHecha,
  type RevisionPendiente,
  type RevisionesResponse,
} from "@/lib/revisiones-api";
import c from "./comun.module.css";
import s from "./EnEsperaRevisionView.module.css";

export type VerRevisiones = "pendientes" | "revisadas";

const DESDE_REVISION: OrigenActividad = { tipo: "revision" };
const DESDE_REVISADAS: OrigenActividad = { tipo: "revisadas" };

/** Revisar = la pestaña Evidencias de la actividad, en el bloque de revisión, sabiendo de dónde vino. */
export function hrefRevisar(activityId: number, origen: OrigenActividad = DESDE_REVISION): string {
  return conOrigen(`/erp/actividades/${activityId}/evidencias#revision`, origen);
}

function ActividadCelda({ item }: { item: { titulo: string; anNumber: string; coreKind: string | null; ticketTypeCustom: string | null } }) {
  return (
    <span className={s.actividad}>
      <span className={s.tipo} aria-hidden="true">
        <ActivityKindIcon kind={kindIcon(item)} size={18} />
      </span>
      <span className={s.actividadTexto}>
        <span className={s.titulo}>{item.titulo}</span>
        <span className={`${s.sub} ${s.meta}`}>
          <span className={c.folio}>{item.anNumber}</span>
          <span>
            <span className={s.sep}> · </span>
            {kindLabel(item)}
          </span>
        </span>
      </span>
    </span>
  );
}

function Estrellas({ valor }: { valor: number | null }) {
  if (valor == null) return null;
  const v = Math.max(0, Math.min(5, Math.round(valor)));
  return (
    <span className={s.estrellas} role="img" aria-label={`Eficiencia ${v} de 5`} title={`Eficiencia ${v} de 5`}>
      {"★".repeat(v)}
      <span className={s.estrellasVacias}>{"★".repeat(5 - v)}</span>
    </span>
  );
}

export default function EnEsperaRevisionView({
  data,
  loading,
  error,
  onRecargar,
  ver,
  onVer,
}: {
  data: RevisionesResponse | null;
  loading: boolean;
  error: string | null;
  onRecargar: () => void;
  ver: VerRevisiones;
  onVer: (v: VerRevisiones) => void;
}) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const ahora = Date.now();

  const pendientes = useMemo(() => data?.pendientes ?? [], [data]);
  const revisadas = useMemo(() => data?.revisadas ?? [], [data]);
  const pendientesVisibles = useMemo(
    () => pendientes.filter((p) => coincideBusqueda(p, busqueda)),
    [pendientes, busqueda],
  );
  const revisadasVisibles = useMemo(
    () => revisadas.filter((r) => coincideBusqueda(r, busqueda)),
    [revisadas, busqueda],
  );
  const tarde = pendientes.filter((p) => (minutosEsperando(p.enviadaAt, ahora) ?? 0) >= 24 * 60).length;
  const correcciones = pendientes.filter((p) => p.correccion).length;

  const columnasPendientes: Column<RevisionPendiente>[] = [
    { key: "actividad", label: "Actividad", render: (p) => <ActividadCelda item={p} /> },
    {
      key: "persona",
      label: "Quién la envió",
      width: 220,
      render: (p) => (
        <PersonCell name={p.persona.nombre} avatarUrl={p.persona.avatarUrl} subtitle={p.persona.puesto ?? undefined} />
      ),
    },
    {
      key: "espera",
      label: "Espera desde",
      width: 170,
      render: (p) => {
        const min = minutosEsperando(p.enviadaAt, ahora);
        return (
          <WhenCell
            time={textoEspera(min)}
            hint={p.enviadaAt ? cuandoMx(p.enviadaAt, ahora) : undefined}
            tone={tonoEspera(min)}
          />
        );
      },
    },
    {
      key: "estado",
      label: "Estado",
      width: 170,
      render: (p) => (
        <span className={s.estado}>
          {p.correccion ? (
            <Badge size="sm" tone="violet" title="Le devolvieron evidencia y ya mandó la corrección">
              Corrección
            </Badge>
          ) : null}
          <StatusBadge size="sm" status={p.estatus} />
        </span>
      ),
    },
  ];

  const columnasRevisadas: Column<RevisionHecha>[] = [
    { key: "actividad", label: "Actividad", render: (r) => <ActividadCelda item={r} /> },
    {
      key: "persona",
      label: "De quién",
      width: 220,
      render: (r) => (
        <PersonCell name={r.persona.nombre} avatarUrl={r.persona.avatarUrl} subtitle={r.persona.puesto ?? undefined} />
      ),
    },
    {
      key: "decision",
      label: "Tu revisión",
      width: 200,
      render: (r) => {
        const d = decisionUi(r.decision);
        return (
          <span className={s.estado}>
            <Badge size="sm" tone={d.tone} dot>
              {d.label}
            </Badge>
            <Estrellas valor={r.calificacion} />
          </span>
        );
      },
    },
    {
      key: "fecha",
      label: "Cuándo",
      width: 150,
      render: (r) => <WhenCell time={cuandoMx(r.at, ahora)} />,
    },
  ];

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
        <FilterChips ariaLabel="Qué ver">
          <FilterChip active={ver === "pendientes"} count={pendientes.length} onClick={() => onVer("pendientes")}>
            Por revisar
          </FilterChip>
          <FilterChip active={ver === "revisadas"} count={revisadas.length} onClick={() => onVer("revisadas")}>
            Revisadas por ti
          </FilterChip>
        </FilterChips>
      }
    />
  );

  let contenido: ReactNode;
  if (loading && !data) {
    contenido = (
      <div className={s.relleno}>
        <SkeletonRows rows={5} label="Cargando lo que espera revisión" />
      </div>
    );
  } else if (error && !data) {
    contenido = (
      <div className={s.relleno}>
        <Alert
          tone="danger"
          role="alert"
          action={
            <Button size="sm" className={c.tap} onClick={onRecargar} loading={loading}>
              Reintentar
            </Button>
          }
        >
          {error}
        </Alert>
      </div>
    );
  } else if (ver === "pendientes" && pendientes.length === 0) {
    contenido = (
      <EmptyState
        icon={<CelebrationOutlinedIcon />}
        tone="success"
        titleAs="h2"
        title="Nada espera tu revisión"
        description="Cuando alguien de tu equipo envíe su evidencia, aparece aquí para que la apruebes o la devuelvas."
      />
    );
  } else if (ver === "revisadas" && revisadas.length === 0) {
    contenido = (
      <EmptyState
        icon={<FactCheckOutlinedIcon />}
        tone="neutral"
        titleAs="h2"
        title="No has revisado nada en los últimos 30 días"
      />
    );
  } else if (ver === "pendientes") {
    contenido = (
      <DataTable
        columns={columnasPendientes}
        rows={pendientesVisibles}
        rowKey={(p) => `${p.activityId}-${p.persona.id}`}
        onRowClick={(p) => router.push(conOrigen(`/erp/actividades/${p.activityId}`, DESDE_REVISION))}
        rowActions={(p) => (
          <ButtonLink
            href={hrefRevisar(p.activityId)}
            size="sm"
            variant="primary"
            iconStart={<RateReviewOutlinedIcon />}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Revisar la evidencia de ${p.persona.nombre} en ${p.anNumber}`}
          >
            Revisar
          </ButtonLink>
        )}
        rowActionsLabel="Revisar"
        flush
        className={s.tabla}
        ariaLabel="Evidencias en espera de revisión"
        emptyTitle={`Nada coincide con «${busqueda.trim()}»`}
        emptyDescription=""
      />
    );
  } else {
    contenido = (
      <DataTable
        columns={columnasRevisadas}
        rows={revisadasVisibles}
        rowKey={(r) => r.id}
        onRowClick={(r) => router.push(hrefRevisar(r.activityId, DESDE_REVISADAS))}
        rowActions={(r) => (
          <ButtonLink
            href={hrefRevisar(r.activityId, DESDE_REVISADAS)}
            size="sm"
            variant="ghost"
            onClick={(e) => e.stopPropagation()}
            aria-label={`Ver la revisión de ${r.persona.nombre} en ${r.anNumber}`}
          >
            Ver
          </ButtonLink>
        )}
        rowActionsLabel="Abrir"
        flush
        className={s.tabla}
        ariaLabel="Revisiones que hiciste"
        emptyTitle={`Nada coincide con «${busqueda.trim()}»`}
        emptyDescription=""
      />
    );
  }

  const total = ver === "pendientes" ? pendientes.length : revisadas.length;
  const visibles = ver === "pendientes" ? pendientesVisibles.length : revisadasVisibles.length;

  return (
    <div className={s.vista}>
      {data && pendientes.length > 0 ? (
        <StatRow cols={3} ariaLabel="Resumen de lo que espera revisión">
          <Stat
            label="Por revisar"
            value={pendientes.length}
            tone="brand"
            hint="evidencias enviadas sin aprobar"
            icon={<RateReviewOutlinedIcon />}
            onClick={() => onVer("pendientes")}
            pressed={ver === "pendientes"}
          />
          <Stat
            label="Esperan más de un día"
            value={tarde}
            tone={tarde > 0 ? "danger" : "default"}
            hint={tarde > 0 ? "atiéndelas primero" : "todas recientes"}
            icon={<HourglassBottomIcon />}
            iconTone={tarde > 0 ? "danger" : "neutral"}
          />
          <Stat
            label="Correcciones"
            value={correcciones}
            hint="reenviadas tras devolverlas"
            icon={<FactCheckOutlinedIcon />}
            iconTone={correcciones > 0 ? "warning" : "neutral"}
          />
        </StatRow>
      ) : null}

      {error && data ? (
        <Alert
          tone="warning"
          role="status"
          action={
            <Button size="sm" className={c.tap} onClick={onRecargar} loading={loading}>
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
            {busqueda.trim()
              ? `${visibles} de ${total}`
              : ver === "pendientes"
                ? `${total} por revisar · la que más lleva esperando va primero`
                : pieRevisadas(total)}
          </ListFooter>
        ) : null}
      </Card>
    </div>
  );
}
