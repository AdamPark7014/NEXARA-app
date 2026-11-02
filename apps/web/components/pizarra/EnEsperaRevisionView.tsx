"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import RateReviewOutlinedIcon from "@mui/icons-material/RateReviewOutlined";
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
  Textarea,
  WhenCell,
  type Column,
  type RowKey,
} from "@/components/base";
import Modal from "@/components/ui/Modal";
import { useCronometroProceso } from "@/lib/cronometro-proceso";
import ActivityKindIcon from "@/components/ops/ActivityKindIcon";
import { kindIcon, kindLabel } from "@/lib/activity-labels";
import { conOrigen, type OrigenActividad } from "@/lib/actividad-origen";
import { cuandoMx } from "@/components/pizarra/equipo-estado";
import {
  aprobarLote,
  coincideBusqueda,
  decisionUi,
  minutosEsperando,
  pieRevisadas,
  textoEspera,
  TOPE_LOTE,
  type RevisionHecha,
  type RevisionPendiente,
  type RevisionesResponse,
} from "@/lib/revisiones-api";
import c from "./comun.module.css";
import s from "./EnEsperaRevisionView.module.css";

export type VerRevisiones = "pendientes" | "otros" | "revisadas";

const llaveDe = (p: RevisionPendiente) => `${p.activityId}-${p.persona.id}`;
const NOTA_LOTE = "Revisado en lote: todo correcto.";

/** Aprobar varias de un jalón: las estrellas se eligen, como en una sola; la nota se puede editar. */
function AprobarLote({
  token,
  items,
  onCerrar,
  onHecho,
}: {
  token: string;
  items: RevisionPendiente[];
  onCerrar: () => void;
  onHecho: (aprobadas: number, fallidas: number) => void;
}) {
  const [estrellas, setEstrellas] = useState(0);
  const [nota, setNota] = useState(NOTA_LOTE);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const notaValida = nota.trim().length >= 5;

  const aprobar = async () => {
    setEnviando(true);
    setError(null);
    try {
      const r = await aprobarLote(
        token,
        items.map((p) => ({ activityId: p.activityId, userId: p.persona.id })),
        estrellas,
        nota.trim(),
      );
      onHecho(r.aprobadas.length, r.fallidas.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron aprobar. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal open onClose={onCerrar} title={items.length === 1 ? "Aprobar 1 evidencia" : `Aprobar ${items.length} evidencias`}>
      <div className={s.lote}>
        <p className={s.sub}>Todas quedan aprobadas con la misma calificación y la misma nota. Cada persona recibe un solo aviso.</p>
        <div role="radiogroup" aria-label="Calificación de eficiencia" className={s.loteEstrellas}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={estrellas === n}
              aria-label={`${n} de 5`}
              className={n <= estrellas ? s.estrellaOn : s.estrellaOff}
              onClick={() => setEstrellas(n)}
            >
              ★
            </button>
          ))}
        </div>
        <label className={s.sub} htmlFor="lote-nota">
          Observaciones
        </label>
        <Textarea id="lote-nota" rows={2} value={nota} invalid={!notaValida} onChange={(e) => setNota(e.target.value)} />
        {error ? (
          <Alert tone="danger" role="alert">
            {error}
          </Alert>
        ) : null}
        <div className={s.loteAcciones}>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!estrellas || !notaValida} loading={enviando} onClick={() => void aprobar()}>
            {items.length === 1 ? "Aprobar" : `Aprobar ${items.length}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

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
  token,
}: {
  data: RevisionesResponse | null;
  loading: boolean;
  error: string | null;
  onRecargar: () => void;
  ver: VerRevisiones;
  onVer: (v: VerRevisiones) => void;
  /** Con él se puede aprobar por lote. */
  token?: string | null;
}) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [seleccion, setSeleccion] = useState<RowKey[]>([]);
  const [lote, setLote] = useState<RevisionPendiente[] | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const cronometro = useCronometroProceso("revisar", token);
  const ahora = Date.now();

  const todas = useMemo(() => data?.pendientes ?? [], [data]);
  /** Lo de otros jefes se puede abrir, pero no te estorba: no te toca a ti. */
  const pendientes = useMemo(() => todas.filter((p) => p.paraTi !== false), [todas]);
  const deOtros = useMemo(() => todas.filter((p) => p.paraTi === false), [todas]);
  const lista = ver === "otros" ? deOtros : pendientes;
  const revisadas = useMemo(() => data?.revisadas ?? [], [data]);
  const pendientesVisibles = useMemo(
    () => lista.filter((p) => coincideBusqueda(p, busqueda)),
    [lista, busqueda],
  );
  const revisadasVisibles = useMemo(
    () => revisadas.filter((r) => coincideBusqueda(r, busqueda)),
    [revisadas, busqueda],
  );
  const correcciones = pendientes.filter((p) => p.correccion).length;

  const columnasPendientes: Column<RevisionPendiente>[] = [
    { key: "actividad", label: "Actividad", render: (p) => <ActividadCelda item={p} /> },
    {
      key: "persona",
      label: "Quién la envió",
      width: 220,
      render: (p) => (
        <PersonCell
          name={p.persona.nombre}
          avatarUrl={p.persona.avatarUrl}
          subtitle={ver === "otros" && p.jefe ? `Le toca a ${p.jefe}` : (p.persona.puesto ?? undefined)}
        />
      ),
    },
    {
      // Solo informa desde cuándo está: lo enviado ya cuenta como cumplido y revisarlo tarde no
      // es un atraso (Adam, 29-10), así que sin semáforo.
      key: "enviada",
      label: "Enviada",
      width: 170,
      render: (p) => (
        <WhenCell
          time={textoEspera(minutosEsperando(p.enviadaAt, ahora))}
          hint={p.enviadaAt ? cuandoMx(p.enviadaAt, ahora) : undefined}
        />
      ),
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
          {p.escalada ? (
            <Badge size="sm" tone="warning" title="Lleva más de 24 horas sin revisar. Revisarla tarde no le cuenta como atraso a quien la entregó">
              Más de 24 h
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
          {deOtros.length > 0 ? (
            <FilterChip active={ver === "otros"} count={deOtros.length} onClick={() => onVer("otros")}>
              De otros jefes
            </FilterChip>
          ) : null}
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
        description={
          deOtros.length > 0
            ? `Las ${deOtros.length} que siguen pendientes las revisan sus jefes. Si pasan de 24 horas, te aparecen aquí.`
            : "Cuando alguien de tu equipo envíe su evidencia, aparece aquí para que la apruebes o la devuelvas."
        }
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
  } else if (ver === "pendientes" || ver === "otros") {
    contenido = (
      <DataTable
        columns={columnasPendientes}
        rows={pendientesVisibles}
        rowKey={llaveDe}
        selectable={Boolean(token)}
        selectedKeys={seleccion}
        onSelectionChange={(llaves) => setSeleccion(llaves.slice(0, TOPE_LOTE))}
        selectRowLabel={(p) => `Elegir la evidencia de ${p.persona.nombre} en ${p.anNumber}`}
        selectionBar={({ rows }) => (
          <Button size="sm" variant="primary" onClick={() => setLote(rows)}>
            {rows.length === 1 ? "Aprobar 1" : `Aprobar ${rows.length}`}
          </Button>
        )}
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

  const total = ver === "revisadas" ? revisadas.length : lista.length;
  const visibles = ver === "revisadas" ? revisadasVisibles.length : pendientesVisibles.length;

  return (
    <div className={s.vista}>
      {aviso ? (
        <Alert tone="success" role="status">
          {aviso}
        </Alert>
      ) : null}
      {lote && token ? (
        <AprobarLote
          token={token}
          items={lote}
          onCerrar={() => setLote(null)}
          onHecho={(aprobadas, fallidas) => {
            cronometro.terminar(null, `lote:${aprobadas}`);
            setLote(null);
            setSeleccion([]);
            setAviso(
              fallidas
                ? `Aprobadas: ${aprobadas}. No se pudieron aprobar: ${fallidas}; ábrelas una por una.`
                : aprobadas === 1
                  ? "Aprobaste 1 evidencia."
                  : `Aprobaste ${aprobadas} evidencias.`,
            );
            onRecargar();
          }}
        />
      ) : null}
      {data && pendientes.length > 0 ? (
        <StatRow cols={2} ariaLabel="Resumen de lo que espera revisión">
          <Stat
            label="Por revisar"
            value={pendientes.length}
            tone="brand"
            hint="entregadas: ya cuentan como cumplidas"
            icon={<RateReviewOutlinedIcon />}
            onClick={() => onVer("pendientes")}
            pressed={ver === "pendientes"}
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
                ? `${total} por revisar · las más antiguas primero`
                : pieRevisadas(total)}
          </ListFooter>
        ) : null}
      </Card>
    </div>
  );
}
