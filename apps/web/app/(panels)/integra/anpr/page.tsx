"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import DirectionsCarFilledOutlinedIcon from "@mui/icons-material/DirectionsCarFilledOutlined";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import ImageNotSupportedOutlinedIcon from "@mui/icons-material/ImageNotSupportedOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import RestartAltOutlinedIcon from "@mui/icons-material/RestartAltOutlined";
import {
  IgBadge,
  IgBtn,
  IgField,
  IgFilters,
  IgNotice,
  IgPage,
  IgPanel,
  IgTable,
  IgToolbar,
} from "../_Console";
import {
  OpsCount,
  OpsErrorState,
  OpsExpandBtn,
  OpsPager,
  OpsSkeletonTable,
  readIntParam,
  readParam,
  useUrlFilters,
  opsStyles as ops,
} from "../_ops/OpsKit";
import { defaultRangeHours, inputStyle, integraApi, selectStyle } from "../_lib";
import EmptyState from "@/components/ui/EmptyState";
import {
  ANPR_MAX_PAGE_SIZE,
  ANPR_MAX_PLATE_LEN,
  ANPR_MAX_RANGE_DAYS,
  anprDirection,
  anprVehicleColor,
  anprVehicleType,
  rangeDays,
  toArtemisTime,
  type AnprPageResponse,
  type AnprQuery,
  type AnprRecord,
} from "./_anpr";

type CameraOpt = {
  id: string;
  name: string;
  anprCapable?: boolean;
};

/** Lo que de verdad se le pidió al servidor. El formulario es solo un borrador. */
type Applied = {
  start: string;
  end: string;
  plate: string;
  owner: string;
  cameraId: string;
  pageNo: number;
  pageSize: number;
  /** 1 = más recientes primero (valor por defecto del manual). */
  orderType: 0 | 1;
};

const PAGE_SIZES = [25, 50, 100, 200];

const fmtTime = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("es-MX", { hour12: false });
};

/** Valor de un `datetime-local` en texto legible. */
const fmtLocal = (datetimeLocal: string) => {
  const d = new Date(datetimeLocal);
  return Number.isNaN(d.getTime())
    ? datetimeLocal
    : d.toLocaleString("es-MX", { hour12: false });
};

export default function IntegraAnprPage() {
  return (
    <Suspense
      fallback={
        <IgPage>
          <IgToolbar title="ANPR / PMS" meta="Cargando…" />
          <IgPanel title="Cruces de placa" flush>
            <OpsSkeletonTable columns={["1.1fr", "1.3fr", "1.4fr", "1fr", "0.7fr", "0.6fr"]} />
          </IgPanel>
        </IgPage>
      }
    >
      <AnprConsole />
    </Suspense>
  );
}

function AnprConsole() {
  const sp = useSearchParams();
  const range0 = useMemo(() => defaultRangeHours(24), []);

  // ── Estado aplicado (lo que está en pantalla y en la URL) ──────────────
  const [applied, setApplied] = useState<Applied>(() => ({
    start: readParam(sp, "desde", range0.start),
    end: readParam(sp, "hasta", range0.end),
    plate: readParam(sp, "placa"),
    owner: readParam(sp, "dueno"),
    cameraId: readParam(sp, "camara"),
    pageNo: readIntParam(sp, "pag", 1),
    pageSize: Math.min(readIntParam(sp, "tam", 50), ANPR_MAX_PAGE_SIZE),
    orderType: readParam(sp, "orden") === "asc" ? 0 : 1,
  }));

  // ── Borrador del formulario ────────────────────────────────────────────
  const [draft, setDraft] = useState({
    start: applied.start,
    end: applied.end,
    plate: applied.plate,
    owner: applied.owner,
    cameraId: applied.cameraId,
    orderType: applied.orderType,
  });

  const [records, setRecords] = useState<AnprRecord[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [cameras, setCameras] = useState<CameraOpt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Primera carga = esqueleto. Recargas = la tabla se queda y se atenúa. */
  const [firstLoad, setFirstLoad] = useState(true);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const reqSeq = useRef(0);

  useUrlFilters({
    desde: applied.start,
    hasta: applied.end,
    placa: applied.plate,
    dueno: applied.owner,
    camara: applied.cameraId,
    pag: applied.pageNo > 1 ? applied.pageNo : null,
    tam: applied.pageSize !== 50 ? applied.pageSize : null,
    orden: applied.orderType === 0 ? "asc" : null,
  });

  // El catálogo de cámaras da nombre legible al `cameraIndexCode` de cada
  // cruce y alimenta el selector. Si falla, la pantalla sigue funcionando.
  useEffect(() => {
    let cancel = false;
    integraApi<{ items: CameraOpt[] }>("integra/cameras")
      .then((r) => {
        if (!cancel) setCameras(r.items || []);
      })
      .catch(() => {
        if (!cancel) setCameras([]);
      });
    return () => {
      cancel = true;
    };
  }, []);

  const cameraName = useCallback(
    (id?: string) => {
      if (!id) return null;
      return cameras.find((c) => c.id === id)?.name ?? id;
    },
    [cameras],
  );

  // ── Búsqueda ───────────────────────────────────────────────────────────
  const run = useCallback(async (q: Applied) => {
    const startTime = toArtemisTime(q.start);
    const endTime = toArtemisTime(q.end);
    if (!startTime || !endTime) {
      setError("Rango de fechas incompleto: elige «Desde» y «Hasta».");
      setFirstLoad(false);
      return;
    }

    const seq = ++reqSeq.current;
    setBusy(true);
    setError(null);
    try {
      const body: AnprQuery = {
        pageNo: q.pageNo,
        pageSize: q.pageSize,
        startTime,
        endTime,
        sortField: "PassTime",
        orderType: q.orderType,
        // Filtros de servidor documentados (§5.8.2): solo viajan si tienen valor.
        ...(q.cameraId ? { cameraIndexCode: q.cameraId } : {}),
        ...(q.plate.trim() ? { plateNo: q.plate.trim().slice(0, ANPR_MAX_PLATE_LEN) } : {}),
        ...(q.owner.trim() ? { ownerName: q.owner.trim() } : {}),
      };
      const data = await integraApi<AnprPageResponse>("integra/anpr/cross-records", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (seq !== reqSeq.current) return; // respuesta vieja: se descarta
      setRecords(Array.isArray(data?.list) ? data.list : []);
      setTotal(typeof data?.total === "number" ? data.total : null);
    } catch (e) {
      if (seq !== reqSeq.current) return;
      setRecords([]);
      setTotal(null);
      setError(e instanceof Error ? e.message : "Fallo desconocido al consultar PMS");
    } finally {
      if (seq === reqSeq.current) {
        setBusy(false);
        setFirstLoad(false);
      }
    }
  }, []);

  // Carga inicial con datos: la pantalla ya no arranca vacía esperando un clic.
  useEffect(() => {
    void run(applied);
  }, [applied, run]);

  const days = rangeDays(draft.start, draft.end);
  const rangeTooLong = days != null && days > ANPR_MAX_RANGE_DAYS;
  const rangeInverted = days != null && days < 0;
  const canSearch = !rangeTooLong && !rangeInverted && Boolean(draft.start && draft.end);

  const applyDraft = () => {
    if (!canSearch) return;
    setOpenRow(null);
    setApplied({ ...draft, pageNo: 1, pageSize: applied.pageSize });
  };

  const resetAll = () => {
    const fresh = defaultRangeHours(24);
    const next: Applied = {
      start: fresh.start,
      end: fresh.end,
      plate: "",
      owner: "",
      cameraId: "",
      pageNo: 1,
      pageSize: 50,
      orderType: 1,
    };
    setDraft({
      start: next.start,
      end: next.end,
      plate: "",
      owner: "",
      cameraId: "",
      orderType: 1,
    });
    setOpenRow(null);
    setApplied(next);
  };

  const dirtyDraft =
    draft.start !== applied.start ||
    draft.end !== applied.end ||
    draft.plate !== applied.plate ||
    draft.owner !== applied.owner ||
    draft.cameraId !== applied.cameraId ||
    draft.orderType !== applied.orderType;

  const withPhoto = records.filter((r) => Boolean(r.vehiclePicUri)).length;
  const hasServerFilter = Boolean(applied.plate || applied.owner || applied.cameraId);

  const activeFilters: string[] = [];
  if (applied.plate) activeFilters.push(`placa «${applied.plate}»`);
  if (applied.owner) activeFilters.push(`dueño «${applied.owner}»`);
  if (applied.cameraId) activeFilters.push(`cámara ${cameraName(applied.cameraId)}`);

  const rows = records.map((r, i) => {
    const key = String(r.crossRecordSyscode || `${r.plateNo ?? "s-placa"}-${r.crossTime ?? i}`);
    const detailId = `anpr-detalle-${key.replace(/[^a-zA-Z0-9_-]/g, "")}`;
    const type = anprVehicleType(r.vehicleType);
    const color = anprVehicleColor(r.vehicleColor);
    return {
      key,
      detailId,
      record: r,
      cells: {
        p: r.plateNo ? (
          <strong style={{ fontFamily: "var(--ig-font-mono)", letterSpacing: "0.04em" }}>
            {r.plateNo}
          </strong>
        ) : (
          <span style={{ color: "var(--ig-muted)" }}>Sin lectura</span>
        ),
        t: fmtTime(r.crossTime),
        c: cameraName(r.cameraIndexCode) ?? "—",
        ty: [type, color].filter(Boolean).join(" · ") || "—",
        o: r.ownerName || "—",
        f: r.vehiclePicUri ? (
          <IgBadge tone="accent">
            <PhotoCameraOutlinedIcon
              style={{ fontSize: 12, verticalAlign: "-2px", marginRight: 3 }}
              aria-hidden="true"
            />
            Sí
          </IgBadge>
        ) : (
          <span style={{ color: "var(--ig-muted)" }}>—</span>
        ),
        x: (
          <OpsExpandBtn
            expanded={openRow === key}
            onToggle={() => setOpenRow(openRow === key ? null : key)}
            controls={detailId}
            label={openRow === key ? "Ocultar" : "Detalle"}
          />
        ),
      },
    };
  });

  const open = rows.find((r) => r.key === openRow);

  return (
    <IgPage>
      <IgToolbar
        title="ANPR / PMS"
        meta={
          firstLoad
            ? "consultando…"
            : total != null
              ? `${total.toLocaleString("es-MX")} cruces en el rango`
              : `${records.length} cruces en esta página`
        }
        actions={
          <>
            <IgBtn onClick={resetAll} disabled={busy}>
              <RestartAltOutlinedIcon
                style={{ fontSize: 14, marginRight: 5, verticalAlign: "-2px" }}
                aria-hidden="true"
              />
              Últimas 24 h
            </IgBtn>
            <IgBtn variant="primary" disabled={busy || !canSearch} onClick={applyDraft}>
              <SearchOutlinedIcon
                style={{ fontSize: 14, marginRight: 5, verticalAlign: "-2px" }}
                aria-hidden="true"
              />
              {busy ? "Buscando…" : "Buscar"}
            </IgBtn>
          </>
        }
      />

      {error && (
        <OpsErrorState
          title="No se pudieron traer los cruces de placa"
          hint={
            <>
              La búsqueda ANPR vive en el módulo PMS de HikCentral. Si el sitio no
              tiene esa licencia o la cámara de placas no está dada de alta, la
              plataforma rechaza la consulta. Comprueba el sitio activo en la barra
              superior y vuelve a intentar.
            </>
          }
          detail={error}
          onRetry={() => void run(applied)}
        />
      )}

      <IgFilters>
        <IgField label="Desde">
          <input
            type="datetime-local"
            value={draft.start}
            onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value }))}
            style={inputStyle}
          />
        </IgField>
        <IgField label="Hasta">
          <input
            type="datetime-local"
            value={draft.end}
            onChange={(e) => setDraft((d) => ({ ...d, end: e.target.value }))}
            style={inputStyle}
          />
        </IgField>
        <IgField label="Placa">
          <input
            value={draft.plate}
            maxLength={ANPR_MAX_PLATE_LEN}
            placeholder="ABC1234"
            onChange={(e) => setDraft((d) => ({ ...d, plate: e.target.value.toUpperCase() }))}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyDraft();
            }}
            style={inputStyle}
          />
        </IgField>
        <IgField label="Dueño">
          <input
            value={draft.owner}
            maxLength={64}
            onChange={(e) => setDraft((d) => ({ ...d, owner: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyDraft();
            }}
            style={inputStyle}
          />
        </IgField>
        <IgField label="Cámara">
          <select
            value={draft.cameraId}
            onChange={(e) => setDraft((d) => ({ ...d, cameraId: e.target.value }))}
            style={selectStyle}
          >
            <option value="">Todas</option>
            {cameras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.anprCapable ? `${c.name} · ANPR` : c.name}
              </option>
            ))}
          </select>
        </IgField>
        <IgField label="Orden">
          <select
            value={draft.orderType}
            onChange={(e) =>
              setDraft((d) => ({ ...d, orderType: Number(e.target.value) === 0 ? 0 : 1 }))
            }
            style={{ ...selectStyle, maxWidth: 190 }}
          >
            <option value={1}>Más recientes primero</option>
            <option value={0}>Más antiguos primero</option>
          </select>
        </IgField>
      </IgFilters>

      {rangeInverted && (
        <IgNotice tone="warn">
          «Hasta» es anterior a «Desde»: corrige el rango antes de buscar.
        </IgNotice>
      )}
      {rangeTooLong && (
        <IgNotice tone="warn">
          El rango pedido son {Math.round(days ?? 0)} días. HikCentral limita la
          búsqueda de cruces a {ANPR_MAX_RANGE_DAYS} días; acorta las fechas o la
          plataforma rechazará la consulta.
        </IgNotice>
      )}
      {dirtyDraft && !rangeTooLong && !rangeInverted && (
        <IgNotice>
          Has cambiado los filtros pero la tabla sigue mostrando la búsqueda anterior.
          Pulsa «Buscar» para pedir los nuevos al servidor.
        </IgNotice>
      )}

      <IgPanel
        title="Cruces de placa"
        count={
          firstLoad ? null : total != null ? total.toLocaleString("es-MX") : records.length
        }
        flush
      >
        {firstLoad ? (
          <OpsSkeletonTable
            columns={["1.1fr", "1.3fr", "1.4fr", "1.2fr", "1fr", "0.5fr", "0.6fr"]}
            rows={8}
            label="Consultando cruces en HikCentral PMS…"
          />
        ) : records.length === 0 ? (
          <div className={ops.emptyWrap}>
            <EmptyState
              icon={<DirectionsCarFilledOutlinedIcon fontSize="inherit" />}
              title={
                hasServerFilter
                  ? "Ningún cruce coincide con esos filtros"
                  : "Sin cruces de placa en el rango"
              }
              description={
                hasServerFilter ? (
                  <>
                    Buscaste {activeFilters.join(" · ")} entre {fmtTime(new Date(applied.start).toISOString())} y{" "}
                    {fmtTime(new Date(applied.end).toISOString())}. El filtro lo resuelve
                    HikCentral sobre el rango completo, así que no hay coincidencias en
                    ninguna página. Amplía las fechas o quita filtros.
                  </>
                ) : (
                  <>
                    Esta pantalla lista las lecturas de placa (ANPR) que registró el
                    módulo PMS de HikCentral en la ventana elegida. No hay ninguna entre
                    esas fechas: prueba a ampliar el rango, o revisa que la cámara de
                    placas del parque esté dada de alta y en línea.
                  </>
                )
              }
              action={
                <IgBtn variant="primary" onClick={resetAll}>
                  Ver las últimas 24 h
                </IgBtn>
              }
            />
          </div>
        ) : (
          <div style={busy ? { opacity: 0.55, transition: "opacity .15s" } : undefined}>
            <OpsCount
              shown={records.length}
              total={total}
              scope={
                activeFilters.length ? (
                  <>Filtrado en el servidor por {activeFilters.join(" · ")}</>
                ) : (
                  <>Sin filtros: todo el parque en el rango</>
                )
              }
            />
            <IgTable
              columns={[
                { key: "p", label: "Placa", width: "130px" },
                { key: "t", label: "Hora", mono: true, width: "165px" },
                { key: "c", label: "Cámara" },
                { key: "ty", label: "Vehículo" },
                { key: "o", label: "Dueño" },
                { key: "f", label: "Foto", width: "80px" },
                { key: "x", label: "", width: "110px" },
              ]}
              rows={rows.map((r) => ({ key: r.key, cells: r.cells }))}
              selectedKey={openRow}
              empty="Sin cruces"
            />
            {open && <AnprDetail id={open.detailId} record={open.record} cameraName={cameraName} />}
            <OpsPager
              page={applied.pageNo}
              pageSize={applied.pageSize}
              total={total}
              shown={records.length}
              totalKnown={total != null}
              busy={busy}
              pageSizes={PAGE_SIZES}
              onPage={(p) => {
                setOpenRow(null);
                setApplied((a) => ({ ...a, pageNo: Math.max(1, p) }));
              }}
              onPageSize={(n) => {
                setOpenRow(null);
                setApplied((a) => ({ ...a, pageSize: n, pageNo: 1 }));
              }}
            />
          </div>
        )}
      </IgPanel>

      {withPhoto > 0 && (
        <IgNotice tone="warn">
          <ImageNotSupportedOutlinedIcon
            style={{ fontSize: 14, verticalAlign: "-3px", marginRight: 5 }}
            aria-hidden="true"
          />
          {withPhoto} de estos {records.length} cruces traen foto del vehículo, pero la
          imagen todavía no se puede pintar aquí: el campo `vehiclePicUri` es una
          referencia interna de HikCentral que solo se resuelve llamando a{" "}
          <code>POST /artemis/api/pms/v1/image</code>, y la API de NEXARA aún no expone
          ese proxy (el que hay, <code>integra/events/picture</code>, es el de eventos
          ACS, otro endpoint). En el detalle de cada fila se muestra la referencia para
          poder localizarla en la plataforma.
        </IgNotice>
      )}
    </IgPage>
  );
}

/** Ficha del cruce con TODOS los campos documentados que la plataforma devolvió. */
function AnprDetail({
  id,
  record,
  cameraName,
}: {
  id: string;
  record: AnprRecord;
  cameraName: (id?: string) => string | null;
}) {
  const facts: Array<[string, string | null]> = [
    ["Placa", record.plateNo || null],
    ["Cruce", record.crossTime ? fmtTime(record.crossTime) : null],
    ["Registrado", record.createTime ? fmtTime(record.createTime) : null],
    ["Cámara", cameraName(record.cameraIndexCode)],
    ["Tipo", anprVehicleType(record.vehicleType)],
    ["Color", anprVehicleColor(record.vehicleColor)],
    ["Sentido", anprDirection(record.vehicleDirectionType)],
    [
      "Velocidad",
      record.vehicleSpeed != null && Number.isFinite(record.vehicleSpeed)
        ? `${record.vehicleSpeed} km/h`
        : null,
    ],
    ["Dueño", record.ownerName || null],
    ["Contacto", record.contact || null],
    ["Id de cruce", record.crossRecordSyscode || null],
  ];
  const known = facts.filter((f): f is [string, string] => Boolean(f[1]));

  return (
    <div id={id} className={ops.detailPanel}>
      <div className={ops.detailHead}>
        <h3 className={ops.detailTitle}>Detalle del cruce</h3>
      </div>
      <div className={ops.kvGrid}>
        {known.map(([k, v]) => (
          <div key={k} style={{ display: "contents" }}>
            <span className={ops.kvKey}>{k}</span>
            <span className={`${ops.kvVal} ${k === "Id de cruce" ? ops.kvMono : ""}`}>{v}</span>
          </div>
        ))}
      </div>
      {record.vehiclePicUri ? (
        <p className={ops.inlineHint}>
          <PhotoCameraOutlinedIcon
            style={{ fontSize: 13, verticalAlign: "-2px", marginRight: 5 }}
            aria-hidden="true"
          />
          Foto en la plataforma · referencia{" "}
          <code className={ops.kvMono}>{record.vehiclePicUri}</code>
        </p>
      ) : (
        <p className={ops.inlineHint}>Este cruce no trae foto del vehículo.</p>
      )}
      {known.length < 4 && (
        <p className={ops.inlineHint}>
          La plataforma devolvió pocos campos para este cruce. Los que faltan son
          opcionales en el manual (tabla A-73) y dependen de lo que sepa reconocer la
          cámara: no se inventan aquí.
        </p>
      )}
    </div>
  );
}
