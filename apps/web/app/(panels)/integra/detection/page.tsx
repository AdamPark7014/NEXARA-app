"use client";

/**
 * Sintonización de detección, cámara por cámara.
 *
 * El problema que resuelve: la detección de cada equipo estaba configurada a
 * ciegas desde el código —región = fotograma entero, sensibilidad 100, sin
 * filtro de confianza, la misma plantilla en las dieciséis cámaras— y de ahí
 * salen los falsos positivos. No había ninguna pantalla donde ver la escena y
 * ajustar encima de ella.
 *
 * Contrato: `GET`/`PATCH integra/cameras/:id/detection` y
 * `POST integra/cameras/:id/detection/apply`. Si el servidor todavía no los
 * publica, la pantalla lo dice con esas palabras: ni se rompe, ni finge que
 * guardó. Lo que sí existe se usa de verdad — el fotograma sale del flujo de
 * la cámara y las cifras de ruido, de `integra/push/events`.
 *
 * **Guardar no es aplicar.** El PATCH cambia la fila; el `apply` escribe en el
 * equipo. Son dos botones distintos porque son dos cosas distintas, y
 * confundirlos dejaría al operador creyendo que la cámara ya está sintonizada
 * cuando solo lo está la base de datos.
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import CloudOffIcon from "@mui/icons-material/CloudOff";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import PublishIcon from "@mui/icons-material/Publish";
import RefreshIcon from "@mui/icons-material/Refresh";
import SaveIcon from "@mui/icons-material/Save";
import {
  IgBadge,
  IgBtn,
  IgEmptyState,
  IgError,
  IgNotice,
  IgPage,
  IgPanel,
  IgToolbar,
} from "../_Console";
import { PanelSkeleton } from "../_PanelKit";
import { integraApi, selectStyle } from "../_lib";
import { RegionCanvas } from "./_RegionCanvas";
import { areaFraction, canAddRegion, newRegion } from "./_regionGeometry";
import { countLabel, fetchCameraNoise, typeLabel, type CameraNoise } from "./_noise";
import {
  CONFIDENCE_ES,
  CONFIDENCE_ORDER,
  DAY_LABELS,
  DAY_NAMES,
  DEFAULT_WINDOW,
  FALLBACK_LIMITS,
  TARGET_ES,
  applyProfile,
  draftFromProfile,
  fetchProfile,
  saveProfile,
  sensitivityMeaning,
  tuningProblems,
  type DetectionConfidence,
  type DetectionProfile,
  type DetectionTarget,
  type TuningDraft,
} from "./_tuningApi";
import css from "./_tuning.module.css";

type Cam = {
  id: string;
  name: string;
  region?: string;
  status?: string | number;
  /** IP del equipo que ve la escena: con ella se casan sus detecciones. */
  sourceIp?: string | null;
  model?: string | null;
  isPtz?: boolean;
};

/** Qué se sabe del endpoint de sintonización en el servidor. */
type Availability =
  | { kind: "checking" }
  | { kind: "ok" }
  | { kind: "unavailable"; status: number }
  | { kind: "error"; message: string };

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "applying" }
  | { kind: "applied"; note: string }
  | { kind: "rejected"; message: string };

const TARGET_ORDER: DetectionTarget[] = ["human", "vehicle", "human,vehicle"];

/** Borrador en blanco mientras no hay perfil. Nunca se manda al servidor. */
const EMPTY_DRAFT: TuningDraft = {
  enabled: true,
  sensitivity: FALLBACK_LIMITS.sensitivityDefault,
  alarmConfidence: "mediumHigh",
  detectionTarget: "human",
  regions: [],
  window: DEFAULT_WINDOW,
};

export default function IntegraDetectionTuningPage() {
  return (
    <Suspense
      fallback={
        <IgPage>
          <IgToolbar title="Sintonización de detección" meta="Cargando…" />
          <IgPanel title="Cámaras">
            <PanelSkeleton rows={3} />
          </IgPanel>
        </IgPage>
      }
    >
      <DetectionTuningConsole />
    </Suspense>
  );
}

function DetectionTuningConsole() {
  const sp = useSearchParams();

  const [cams, setCams] = useState<Cam[]>([]);
  const [camsError, setCamsError] = useState<string | null>(null);
  const [loadingCams, setLoadingCams] = useState(true);
  const [selected, setSelected] = useState<string | null>(sp.get("camara"));

  const [hls, setHls] = useState<string | null>(null);
  const [hlsNote, setHlsNote] = useState<string | null>(null);

  const [availability, setAvailability] = useState<Availability>({ kind: "checking" });
  /** Lo último que el servidor confirmó. `null` mientras no confirme nada. */
  const [profile, setProfile] = useState<DetectionProfile | null>(null);
  const [draft, setDraft] = useState<TuningDraft>(EMPTY_DRAFT);
  const [activeRegion, setActiveRegion] = useState<number | null>(null);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });

  const [noise, setNoise] = useState<CameraNoise | null>(null);
  const [noiseError, setNoiseError] = useState<string | null>(null);
  const [noiseBusy, setNoiseBusy] = useState(false);

  /* ── Inventario de cámaras ──────────────────────────────────────── */

  useEffect(() => {
    let stop = false;
    setLoadingCams(true);
    void integraApi<{ items: Cam[] }>("integra/cameras")
      .then((d) => {
        if (stop) return;
        const items = d.items || [];
        setCams(items);
        setCamsError(null);
        // Un `?camara=` que no está en el inventario no se respeta: enviaría la
        // pantalla a pedir el flujo de una cámara que no existe.
        setSelected((prev) =>
          prev && items.some((c) => c.id === prev) ? prev : (items[0]?.id ?? null),
        );
      })
      .catch((e: unknown) => {
        if (stop) return;
        setCamsError(e instanceof Error ? e.message : "No se pudo listar las cámaras");
      })
      .finally(() => {
        if (!stop) setLoadingCams(false);
      });
    return () => {
      stop = true;
    };
  }, []);

  const cam = useMemo(() => cams.find((c) => c.id === selected) ?? null, [cams, selected]);

  /* ── Flujo de la cámara elegida (de ahí sale el fotograma) ─────── */

  useEffect(() => {
    if (!selected) return;
    let stop = false;
    setHls(null);
    setHlsNote(null);
    void integraApi<{ hls: string | null; note?: string | null }>(
      `integra/cameras/${encodeURIComponent(selected)}/stream`,
      { method: "POST" },
    )
      .then((d) => {
        if (stop) return;
        setHls(d.hls ?? null);
        setHlsNote(d.note ?? null);
      })
      .catch((e: unknown) => {
        if (stop) return;
        setHls(null);
        setHlsNote(e instanceof Error ? e.message : "El servidor no devolvió flujo");
      });
    return () => {
      stop = true;
    };
  }, [selected]);

  /* ── Perfil guardado (o la falta de endpoint) ───────────────────── */

  /**
   * Testigo de la petición en vuelo. Cambiar de cámara mientras la anterior
   * viaja es lo normal en una consola: sin esto, la respuesta lenta de la
   * cámara A acabaría pintada como si fuera el perfil de la B.
   */
  const profileReq = useRef(0);

  const loadProfile = useCallback(async (cameraId: string, keepSaveState = false) => {
    const token = ++profileReq.current;
    setAvailability({ kind: "checking" });
    if (!keepSaveState) setSave({ kind: "idle" });
    const res = await fetchProfile(cameraId);
    if (profileReq.current !== token) return;
    if (res.kind === "ok") {
      setAvailability({ kind: "ok" });
      setProfile(res.data);
      setDraft(draftFromProfile(res.data));
      setActiveRegion(res.data.effective.regions?.length ? 0 : null);
      return;
    }
    setProfile(null);
    setDraft(EMPTY_DRAFT);
    setActiveRegion(null);
    setAvailability(
      res.kind === "unavailable"
        ? { kind: "unavailable", status: res.status }
        : { kind: "error", message: res.message },
    );
  }, []);

  useEffect(() => {
    if (!selected) return;
    void loadProfile(selected);
  }, [selected, loadProfile]);

  /* ── Ruido de esta cámara ───────────────────────────────────────── */

  const noiseReq = useRef(0);

  const refreshNoise = useCallback(async (deviceIp: string) => {
    const token = ++noiseReq.current;
    setNoiseBusy(true);
    try {
      const counted = await fetchCameraNoise(deviceIp);
      if (noiseReq.current !== token) return;
      setNoise(counted);
      setNoiseError(null);
    } catch (e: unknown) {
      if (noiseReq.current !== token) return;
      setNoiseError(e instanceof Error ? e.message : "No se pudo contar las detecciones");
    } finally {
      if (noiseReq.current === token) setNoiseBusy(false);
    }
  }, []);

  // La IP del perfil manda sobre la del espejo: es la que el servidor usa para
  // hablarle al equipo, y por tanto con la que vienen firmados sus eventos.
  const sourceIp = profile?.deviceIp ?? cam?.sourceIp ?? null;

  useEffect(() => {
    setNoise(null);
    setNoiseError(null);
    if (!sourceIp) return;
    void refreshNoise(sourceIp);
  }, [sourceIp, refreshNoise]);

  /* ── Borrador ───────────────────────────────────────────────────── */

  const limits = profile?.limits ?? FALLBACK_LIMITS;
  const editable = availability.kind === "ok";

  const patch = (part: Partial<TuningDraft>) => {
    setDraft((d) => ({ ...d, ...part }));
    setSave((s) => (s.kind === "saved" || s.kind === "applied" ? { kind: "idle" } : s));
  };

  const baseline = useMemo(
    () => (profile ? draftFromProfile(profile) : EMPTY_DRAFT),
    [profile],
  );
  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(baseline),
    [draft, baseline],
  );
  const problems = useMemo(() => tuningProblems(draft, limits), [draft, limits]);

  const doSave = async () => {
    if (!selected || problems.length > 0) return;
    setSave({ kind: "saving" });
    const res = await saveProfile(selected, draft);
    if (res.kind === "ok") {
      setProfile(res.data);
      setDraft(draftFromProfile(res.data));
      setSave({ kind: "saved" });
      return;
    }
    if (res.kind === "unavailable") {
      // No se guardó nada. Decirlo así y volver a marcar la pantalla como no
      // disponible: fingir un «guardado» aquí sería la peor mentira posible.
      setAvailability({ kind: "unavailable", status: res.status });
      setSave({
        kind: "rejected",
        message: "El servidor no tiene este endpoint todavía. No se ha guardado nada.",
      });
      return;
    }
    setSave({ kind: "rejected", message: res.message });
  };

  const doApply = async () => {
    if (!selected) return;
    setSave({ kind: "applying" });
    const res = await applyProfile(selected);
    if (res.kind === "ok") {
      setSave(
        res.data.applied
          ? { kind: "applied", note: res.data.note }
          : {
              kind: "rejected",
              // La nota del servidor dice POR QUÉ no se escribió (un 403
              // notSupport de una PTZ, por ejemplo). Se enseña tal cual.
              message: res.data.note || "El equipo no aceptó la configuración.",
            },
      );
      // Releer sin pisar el aviso: `lastAppliedAt` y la nota acaban de cambiar.
      void loadProfile(selected, true);
      return;
    }
    setSave({
      kind: "rejected",
      message:
        res.kind === "unavailable"
          ? "El servidor no publica todavía el paso de aplicar. No se ha escrito nada en el equipo."
          : res.message,
    });
  };

  /* ── Pintado ────────────────────────────────────────────────────── */

  const sens = sensitivityMeaning(draft.sensitivity);
  const appliedAt = profile?.lastAppliedAt
    ? new Date(profile.lastAppliedAt).toLocaleString("es-MX", { hour12: false })
    : null;

  return (
    <IgPage>
      <IgToolbar
        title="Sintonización de detección"
        meta={
          <>
            <IgBadge
              tone={
                availability.kind === "ok"
                  ? "ok"
                  : availability.kind === "checking"
                    ? "neutral"
                    : "warn"
              }
            >
              {availability.kind === "ok"
                ? "Servidor listo"
                : availability.kind === "checking"
                  ? "Comprobando…"
                  : availability.kind === "unavailable"
                    ? "Sin endpoint"
                    : "Error del servidor"}
            </IgBadge>
            {cams.length > 0 ? <span>{cams.length} cámaras</span> : null}
          </>
        }
        actions={
          <IgBtn onClick={() => selected && void loadProfile(selected)} disabled={!selected}>
            <RefreshIcon fontSize="small" aria-hidden /> Releer del servidor
          </IgBtn>
        }
      />

      <IgError title="No se pudo cargar el inventario de cámaras">{camsError}</IgError>

      <IgPanel title="Cámara">
        <label className={css.srOnly} htmlFor="camara-detec">
          Cámara a sintonizar
        </label>
        {loadingCams ? (
          <PanelSkeleton rows={2} />
        ) : cams.length === 0 ? (
          <IgEmptyState
            title="No hay cámaras en el espejo"
            hint="Reconcilia el sitio desde la barra superior y vuelve a entrar."
          />
        ) : (
          <select
            id="camara-detec"
            style={selectStyle}
            value={selected ?? ""}
            onChange={(e) => setSelected(e.target.value || null)}
          >
            {cams.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.region ? ` · ${c.region}` : ""}
                {c.sourceIp ? ` · ${c.sourceIp}` : ""}
              </option>
            ))}
          </select>
        )}
        {cam?.isPtz ? (
          <IgNotice tone="warn">
            Este equipo es una domo PTZ. En el parque medido, las PTZ responden{" "}
            <code>403 notSupport</code> a <code>Smart/FieldDetection</code>: solo admiten
            detección de movimiento. Lo que se ajuste aquí puede no llegar al equipo.
          </IgNotice>
        ) : null}
        {hlsNote ? <IgNotice tone="warn">{hlsNote}</IgNotice> : null}
        {editable && profile && !profile.hasStoredProfile ? (
          <IgNotice>
            Esta cámara nunca se ha sintonizado: lo que se ve abajo es la plantilla de
            compatibilidad que el servidor le escribiría hoy. Guardar crea su perfil.
          </IgNotice>
        ) : null}
        {editable && profile ? (
          <IgNotice tone={appliedAt ? "ok" : "warn"}>
            {appliedAt
              ? `Escrito en el equipo por última vez el ${appliedAt}.${
                  profile.lastAppliedNote ? ` ${profile.lastAppliedNote}` : ""
                }`
              : "Este perfil nunca se ha escrito en el equipo. Guardar cambia la fila; «Aplicar» cambia la cámara."}
          </IgNotice>
        ) : null}
      </IgPanel>

      {availability.kind === "unavailable" && (
        <IgPanel title="La sintonización aún no está disponible en el servidor">
          <IgEmptyState
            icon={<CloudOffIcon fontSize="small" />}
            title="El endpoint de sintonización todavía no existe"
            description={
              <>
                <code>GET/PATCH integra/cameras/{selected ?? ":id"}/detection</code> respondió{" "}
                <strong>{availability.status}</strong>. Lo que se ve abajo es la escena real de la
                cámara y unos valores por defecto: <strong>no</strong> es la configuración del
                equipo, y nada de lo que se toque se puede guardar hasta que el servidor publique
                el endpoint.
              </>
            }
          />
        </IgPanel>
      )}

      {availability.kind === "error" && (
        <IgError
          title="El servidor falló al leer el perfil de detección"
          onRetry={() => selected && void loadProfile(selected)}
        >
          {availability.message}
        </IgError>
      )}

      <div className={css.layout}>
        <div className={css.column}>
          <IgPanel
            title="Escena y regiones"
            count={
              draft.regions.length > 0
                ? `${draft.regions.length}/${limits.maxRegions}`
                : "todo el cuadro"
            }
            actions={
              <IgBtn
                onClick={() => {
                  patch({ regions: [...draft.regions, newRegion(draft.regions)] });
                  setActiveRegion(draft.regions.length);
                }}
                disabled={!editable || !canAddRegion(draft.regions, limits.maxRegions)}
                title={
                  canAddRegion(draft.regions, limits.maxRegions)
                    ? "Añadir una región de detección"
                    : `La cámara admite ${limits.maxRegions} regiones`
                }
              >
                Añadir región
              </IgBtn>
            }
            flush
          >
            <RegionCanvas
              hls={hls}
              regions={draft.regions}
              activeIndex={activeRegion}
              onChange={(regions) => patch({ regions })}
              onActivate={setActiveRegion}
              disabled={!editable}
              emptyHint={
                hlsNote ??
                "El servidor no devolvió flujo para este equipo. Las regiones se pueden ajustar igualmente, pero a ciegas."
              }
            />
          </IgPanel>

          <IgPanel title="Regiones">
            {draft.regions.length === 0 ? (
              <IgEmptyState
                title="Sin regiones: se detecta el fotograma entero"
                hint="Es la configuración que produce los falsos positivos. Añade una región y arrastra sus vértices sobre la zona que de verdad importa."
              />
            ) : (
              <ul className={css.regionList}>
                {draft.regions.map((r, i) => {
                  const area = areaFraction(r);
                  const wide = area > 0.85;
                  return (
                    <li
                      key={`region-${i}`}
                      className={css.regionRow}
                      data-active={i === activeRegion ? "1" : undefined}
                    >
                      <button
                        type="button"
                        className={css.regionPick}
                        onClick={() => setActiveRegion(i)}
                      >
                        <span>Región {i + 1}</span>
                        <span className={css.regionMeta}>{r.length} vértices</span>
                        <span className={css.regionMeta} data-tone={wide ? "warn" : undefined}>
                          {(area * 100).toFixed(0)} % del cuadro
                          {wide ? " · casi todo" : ""}
                        </span>
                      </button>
                      <button
                        type="button"
                        className={css.iconBtn}
                        aria-label={`Borrar región ${i + 1}`}
                        title={`Borrar región ${i + 1}`}
                        disabled={!editable}
                        onClick={() => {
                          patch({ regions: draft.regions.filter((_, j) => j !== i) });
                          setActiveRegion(null);
                        }}
                      >
                        <DeleteOutlineIcon fontSize="small" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className={css.hint}>
              Arrastra un vértice para moverlo. Con el teclado: Tab hasta el vértice, flechas
              para moverlo (Mayús = paso grande), Supr para quitarlo, «+» para partir el lado.
              Los puntos tenues del centro de cada lado añaden un vértice ahí.
            </p>
          </IgPanel>

          <IgPanel
            title="Ruido de esta cámara"
            actions={
              <IgBtn
                onClick={() => sourceIp && void refreshNoise(sourceIp)}
                disabled={!sourceIp || noiseBusy}
              >
                <RefreshIcon fontSize="small" aria-hidden />
                {noiseBusy ? "Contando…" : "Recontar"}
              </IgBtn>
            }
          >
            {!sourceIp ? (
              <IgEmptyState
                title="Esta cámara no tiene IP de origen en el espejo"
                hint="Sus detecciones llegan firmadas con la IP del equipo; sin ella no se pueden contar. Reconcilia el sitio y vuelve a mirar."
              />
            ) : noiseError ? (
              <IgError onRetry={() => void refreshNoise(sourceIp)}>{noiseError}</IgError>
            ) : !noise ? (
              <PanelSkeleton rows={2} />
            ) : (
              <>
                <div className={css.noiseGrid}>
                  <div className={css.noiseCard}>
                    <span
                      className={css.noiseNum}
                      data-tone={noise.hour.capped ? "warn" : undefined}
                    >
                      {countLabel(noise.hour)}
                    </span>
                    <span className={css.noiseLabel}>Última hora</span>
                  </div>
                  <div className={css.noiseCard}>
                    <span
                      className={css.noiseNum}
                      data-tone={noise.day.capped ? "warn" : undefined}
                    >
                      {countLabel(noise.day)}
                    </span>
                    <span className={css.noiseLabel}>Últimas 24 h</span>
                  </div>
                  {noise.day.byType.slice(0, 2).map((t) => (
                    <div key={t.type} className={css.noiseCard}>
                      <span className={css.noiseNum}>{t.count}</span>
                      <span className={css.noiseLabel}>{typeLabel(t.type)} · 24 h</span>
                    </div>
                  ))}
                </div>
                <p className={css.hint}>
                  Detecciones que el equipo <code>{sourceIp}</code> empujó al servidor. El
                  endpoint devuelve como mucho 300 filas por consulta: un «+» significa que hay al
                  menos esas, probablemente más. No incluye latidos ni VMD, que el servidor filtra
                  como ruido de fondo. Aplica un cambio y vuelve a contar dentro de una hora: si
                  la cifra baja, el ajuste sirvió.
                </p>
              </>
            )}
          </IgPanel>
        </div>

        <div className={css.column}>
          <IgPanel title="Ajustes de detección">
            {/* ── Sensibilidad ─────────────────────────────────────── */}
            <div className={css.control}>
              <div className={css.controlHead}>
                <span className={css.controlLabel}>Sensibilidad</span>
                <span className={css.controlValue}>
                  {draft.sensitivity} · {sens.label}
                </span>
              </div>
              <input
                className={css.slider}
                type="range"
                min={limits.sensitivityMin}
                max={limits.sensitivityMax}
                step={1}
                value={draft.sensitivity}
                disabled={!editable}
                aria-label="Sensibilidad de detección"
                aria-valuetext={`${draft.sensitivity} de ${limits.sensitivityMax}, ${sens.label}`}
                onChange={(e) => patch({ sensitivity: Number(e.target.value) })}
              />
              <div className={css.scale}>
                <span>{limits.sensitivityMin} · sorda</span>
                <span>{limits.sensitivityMax} · al máximo</span>
              </div>
              <p className={css.hint}>{sens.hint}</p>
            </div>

            {/* ── Confianza de alarma ──────────────────────────────── */}
            <div className={css.control}>
              <div className={css.controlHead}>
                <span className={css.controlLabel}>Confianza de alarma</span>
                <span className={css.controlValue}>
                  {CONFIDENCE_ES[draft.alarmConfidence].label}
                </span>
              </div>
              <div className={css.segmented} role="group" aria-label="Confianza de alarma">
                {CONFIDENCE_ORDER.filter((c) => limits.alarmConfidences.includes(c)).map(
                  (c: DetectionConfidence) => (
                    <button
                      key={c}
                      type="button"
                      className={css.segment}
                      aria-pressed={draft.alarmConfidence === c}
                      disabled={!editable}
                      onClick={() => patch({ alarmConfidence: c })}
                    >
                      {CONFIDENCE_ES[c].label}
                    </button>
                  ),
                )}
              </div>
              <p className={css.hint}>{CONFIDENCE_ES[draft.alarmConfidence].hint}</p>
              <p className={css.hint}>
                Aviso: este ajuste es <strong>empírico</strong>. El equipo devuelve el tag, pero
                el fabricante no lo documenta, así que la dirección de la escala no está
                confirmada. Muévelo en una cámara y mira el ruido antes de tocarlo en las
                dieciséis.
              </p>
            </div>

            {/* ── Tipo de objetivo ─────────────────────────────────── */}
            <div className={css.control}>
              <div className={css.controlHead}>
                <span className={css.controlLabel}>Tipo de objetivo</span>
              </div>
              <div className={css.segmented} role="group" aria-label="Tipo de objetivo">
                {TARGET_ORDER.filter((t) => limits.detectionTargets.includes(t)).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={css.segment}
                    aria-pressed={draft.detectionTarget === t}
                    disabled={!editable}
                    onClick={() => patch({ detectionTarget: t })}
                  >
                    {TARGET_ES[t]}
                  </button>
                ))}
              </div>
              <p className={css.hint}>
                Lo que no sea objetivo no genera aviso aunque se mueva. Las AcuSense del parque
                clasifican <code>human</code> y <code>vehicle</code>; una silla arrastrada no es
                ninguna de las dos.
              </p>
            </div>

            {/* ── Ventana horaria ──────────────────────────────────── */}
            <div className={css.control}>
              <div className={css.controlHead}>
                <span className={css.controlLabel}>Cuándo cuenta la detección</span>
              </div>
              <div className={css.timeRow}>
                <input
                  className={css.time}
                  type="time"
                  value={draft.window.start}
                  disabled={!editable}
                  aria-label="Hora de inicio"
                  onChange={(e) => patch({ window: { ...draft.window, start: e.target.value } })}
                />
                <span className={css.timeSep}>a</span>
                <input
                  className={css.time}
                  type="time"
                  value={draft.window.end}
                  disabled={!editable}
                  aria-label="Hora de fin"
                  onChange={(e) => patch({ window: { ...draft.window, end: e.target.value } })}
                />
              </div>
              <div className={css.days} role="group" aria-label="Días en que cuenta">
                {DAY_LABELS.map((d, i) => {
                  const on = draft.window.days.includes(i);
                  return (
                    <button
                      key={DAY_NAMES[i]}
                      type="button"
                      className={css.day}
                      aria-pressed={on}
                      aria-label={DAY_NAMES[i]}
                      title={DAY_NAMES[i]}
                      disabled={!editable}
                      onClick={() =>
                        patch({
                          window: {
                            ...draft.window,
                            days: on
                              ? draft.window.days.filter((x) => x !== i)
                              : [...draft.window.days, i].sort((a, b) => a - b),
                          },
                        })
                      }
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
              <p className={css.hint}>
                Se guarda en el <code>schedule</code> del perfil.
                {draft.window.end < draft.window.start
                  ? " Esta ventana cruza la medianoche."
                  : ""}
              </p>
            </div>

            {problems.length > 0 && (
              <ul className={css.problems}>
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}

            <div className={css.footRow}>
              {dirty ? <span className={css.dirty}>Cambios sin guardar</span> : null}
              {save.kind === "saved" ? <IgBadge tone="ok">Guardado</IgBadge> : null}
              {save.kind === "applied" ? <IgBadge tone="ok">Escrito en el equipo</IgBadge> : null}
              <span className={css.footSpacer} />
              <IgBtn
                onClick={() => {
                  setDraft(baseline);
                  setSave({ kind: "idle" });
                }}
                disabled={!dirty}
              >
                Descartar
              </IgBtn>
              <IgBtn
                variant="primary"
                onClick={() => void doSave()}
                disabled={
                  !editable || !dirty || problems.length > 0 || save.kind === "saving"
                }
                title={
                  editable
                    ? "Guarda el perfil. No escribe todavía en la cámara."
                    : "El servidor no publica todavía este endpoint"
                }
              >
                <SaveIcon fontSize="small" aria-hidden />
                {save.kind === "saving" ? "Guardando…" : "Guardar"}
              </IgBtn>
            </div>

            <div className={css.footRow}>
              <p className={css.hint}>
                Guardar deja el perfil en el servidor. Para que la cámara cambie de verdad hay
                que escribírselo.
              </p>
              <span className={css.footSpacer} />
              <IgBtn
                onClick={() => void doApply()}
                disabled={!editable || dirty || save.kind === "applying"}
                title={
                  dirty
                    ? "Guarda primero: se aplica lo guardado, no el borrador"
                    : "Escribe el perfil guardado en la cámara"
                }
              >
                <PublishIcon fontSize="small" aria-hidden />
                {save.kind === "applying" ? "Aplicando…" : "Aplicar al equipo"}
              </IgBtn>
            </div>

            {save.kind === "rejected" ? (
              <IgError title="No se completó">{save.message}</IgError>
            ) : null}
            {save.kind === "applied" && save.note ? (
              <IgNotice tone="ok">{save.note}</IgNotice>
            ) : null}
          </IgPanel>
        </div>
      </div>
    </IgPage>
  );
}
