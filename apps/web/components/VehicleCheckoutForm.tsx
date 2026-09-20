"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import InlineAlert from "@/components/ui/InlineAlert";
import styles from "@/app/(panels)/erp/vehiculos/vehiculos-core.module.css";
import {
  ETIQUETA_SLOT,
  NIVELES_COMBUSTIBLE,
  SLOTS_VUELTA,
  SLOT_TABLERO,
  formatoKm,
  type MetaFoto,
  type SlotChecklist,
} from "@/lib/vehiculos-api";

/**
 * Checklist de salida / devolución de un vehículo, en cuatro pasos:
 * fotos → tablero → km y combustible → confirmar.
 *
 * Las fotos se toman en el momento: `capture="environment"` abre la cámara en el
 * teléfono y aquí se sella la hora de captura. Una foto sin hora la rechaza la
 * API — es justo así como se rechaza una imagen sacada de la galería.
 */

type Paso = 1 | 2 | 3 | 4;

export type ChecklistFormPayload = {
  files: Record<string, File>;
  meta: Record<string, MetaFoto>;
  odometroKm: number;
  combustible: string;
  /** Espejo numérico de `combustible` (0–100) para los consumidores antiguos. */
  combustiblePct: number;
};

type Props = {
  mode: "salida" | "devolucion";
  /** Devolución: el km final no puede ser menor. */
  odometroInicio?: number | null;
  onSubmit: (payload: ChecklistFormPayload) => Promise<void>;
  loading?: boolean;
};

const PASOS: { n: Paso; titulo: string }[] = [
  { n: 1, titulo: "Fotos" },
  { n: 2, titulo: "Tablero" },
  { n: 3, titulo: "Km y combustible" },
  { n: 4, titulo: "Confirmar" },
];

const AYUDA_CAPTURA =
  "Cada foto se sella con la hora en que se tomó y, si lo permites, con el punto GPS. La API rechaza fotos sin hora, así que no sirven las de la galería.";

export default function VehicleCheckoutForm({ mode, odometroInicio, onSubmit, loading }: Props) {
  const [paso, setPaso] = useState<Paso>(1);
  const [files, setFiles] = useState<Record<string, File>>({});
  const [meta, setMeta] = useState<Record<string, MetaFoto>>({});
  const [previas, setPrevias] = useState<Record<string, string>>({});
  const [odometroKm, setOdometroKm] = useState("");
  const [combustible, setCombustible] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const previasRef = useRef<Record<string, string>>({});

  useEffect(() => {
    previasRef.current = previas;
  }, [previas]);

  useEffect(
    () => () => {
      Object.values(previasRef.current).forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* jsdom / navegador sin soporte */
        }
      });
    },
    [],
  );

  const tomarFoto = useCallback((slot: SlotChecklist, file: File | null | undefined) => {
    if (!file) return;
    const capturedAt = new Date().toISOString();
    setError(null);
    setFiles((prev) => ({ ...prev, [slot]: file }));
    setMeta((prev) => ({ ...prev, [slot]: { capturedAt, lat: null, lng: null } }));
    setPrevias((prev) => {
      const anterior = prev[slot];
      if (anterior) {
        try {
          URL.revokeObjectURL(anterior);
        } catch {
          /* ignore */
        }
      }
      let url = "";
      try {
        url = URL.createObjectURL(file);
      } catch {
        url = "";
      }
      return { ...prev, [slot]: url };
    });

    // Mejor esfuerzo: si el permiso se niega, la foto va sin coordenadas.
    if (typeof navigator !== "undefined" && navigator.geolocation?.getCurrentPosition) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setMeta((prev) => ({
            ...prev,
            [slot]: {
              capturedAt: prev[slot]?.capturedAt ?? capturedAt,
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            },
          }));
        },
        () => undefined,
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
      );
    }
  }, []);

  const faltantesVuelta = useMemo(() => SLOTS_VUELTA.filter((s) => !files[s]), [files]);
  const kmNumero = Number(odometroKm);
  const kmValido = odometroKm.trim() !== "" && Number.isFinite(kmNumero) && kmNumero >= 0;
  const kmMenor =
    kmValido && typeof odometroInicio === "number" && mode === "devolucion" && kmNumero < odometroInicio;

  const validarPaso = (actual: Paso): string | null => {
    if (actual === 1 && faltantesVuelta.length > 0) {
      return `Faltan ${faltantesVuelta.length} fotos: ${faltantesVuelta.map((s) => ETIQUETA_SLOT[s]).join(", ")}`;
    }
    if (actual === 2 && !files[SLOT_TABLERO]) return "Falta la foto del tablero";
    if (actual === 3) {
      if (!kmValido) return "Escribe el kilometraje";
      if (kmMenor) return `El km final no puede ser menor que ${formatoKm(odometroInicio ?? 0)}`;
      if (!combustible) return "Elige el nivel de combustible";
    }
    return null;
  };

  const avanzar = () => {
    const fallo = validarPaso(paso);
    if (fallo) {
      setError(fallo);
      return;
    }
    setError(null);
    setPaso((p) => (p < 4 ? ((p + 1) as Paso) : p));
  };

  const retroceder = () => {
    setError(null);
    setPaso((p) => (p > 1 ? ((p - 1) as Paso) : p));
  };

  const enviar = async () => {
    for (const n of [1, 2, 3] as Paso[]) {
      const fallo = validarPaso(n);
      if (fallo) {
        setError(fallo);
        setPaso(n);
        return;
      }
    }
    const pct = NIVELES_COMBUSTIBLE.find((n) => n.nivel === combustible)?.pct ?? Number(combustible);
    setError(null);
    await onSubmit({
      files,
      meta,
      odometroKm: Math.trunc(kmNumero),
      combustible,
      combustiblePct: Number.isFinite(pct) ? pct : 0,
    });
  };

  const titulo = mode === "salida" ? "Salida del vehículo" : "Devolución del vehículo";

  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>{titulo}</div>

      <ol className={styles.pasos} aria-label="Pasos">
        {PASOS.map((p, i) => (
          <li key={p.n} className={`${styles.paso} ${p.n === paso ? styles.pasoActivo : ""}`}>
            {i > 0 && <span className={styles.pasoSep} aria-hidden="true" />}
            <span
              className={`${styles.pasoNum} ${
                p.n === paso ? styles.pasoNumActivo : p.n < paso ? styles.pasoNumHecho : ""
              }`}
              aria-hidden="true"
            >
              {p.n < paso ? "✓" : p.n}
            </span>
            {p.titulo}
          </li>
        ))}
      </ol>

      {error && <InlineAlert message={error} variant="danger" onDismiss={() => setError(null)} />}

      {paso === 1 && (
        <section aria-label="Fotos del vehículo">
          <p className={styles.notaCaptura}>
            Fotos del momento, tomadas con la cámara
            <span className={styles.info} title={AYUDA_CAPTURA} role="img" aria-label="Cómo se toman las fotos">
              i
            </span>
          </p>
          <div className={styles.rejilla}>
            {SLOTS_VUELTA.map((slot) => (
              <SlotFoto
                key={slot}
                slot={slot}
                file={files[slot]}
                previa={previas[slot]}
                onFile={tomarFoto}
              />
            ))}
          </div>
        </section>
      )}

      {paso === 2 && (
        <section aria-label="Foto del tablero">
          <p className={styles.notaCaptura}>
            Odómetro y gasolina en una sola foto
            <span className={styles.info} title={AYUDA_CAPTURA} role="img" aria-label="Cómo se toma la foto">
              i
            </span>
          </p>
          <SlotFoto
            slot={SLOT_TABLERO}
            file={files[SLOT_TABLERO]}
            previa={previas[SLOT_TABLERO]}
            onFile={tomarFoto}
            grande
          />
        </section>
      )}

      {paso === 3 && (
        <section aria-label="Kilometraje y combustible">
          <label className={styles.campo}>
            <span className={styles.campoLabel}>Kilometraje</span>
            <input
              className={styles.input}
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={odometroKm}
              onChange={(e) => {
                setOdometroKm(e.target.value);
                setError(null);
              }}
            />
          </label>
          {typeof odometroInicio === "number" && mode === "devolucion" && (
            <p className={styles.mini} style={{ marginTop: -8, marginBottom: 12 }}>
              Salió con {formatoKm(odometroInicio)}
            </p>
          )}
          <div className={styles.campo}>
            <span className={styles.campoLabel}>Combustible</span>
            <div className={styles.segmentado} role="group" aria-label="Combustible">
              {NIVELES_COMBUSTIBLE.map((n) => (
                <button
                  key={n.nivel}
                  type="button"
                  className={`${styles.segmento} ${combustible === n.nivel ? styles.segmentoActivo : ""}`}
                  aria-pressed={combustible === n.nivel}
                  onClick={() => {
                    setCombustible(n.nivel);
                    setError(null);
                  }}
                >
                  {n.nivel}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {paso === 4 && (
        <section aria-label="Confirmar">
          <div className={styles.resumen}>
            <Dato label="Fotos" valor={`${Object.keys(files).length} de 7`} />
            <Dato label="Kilometraje" valor={formatoKm(kmNumero)} />
            <Dato label="Combustible" valor={combustible || "—"} />
          </div>
          <div className={styles.rejilla}>
            {[...SLOTS_VUELTA, SLOT_TABLERO].map((slot) => (
              <SlotFoto
                key={slot}
                slot={slot}
                file={files[slot]}
                previa={previas[slot]}
                onFile={tomarFoto}
              />
            ))}
          </div>
        </section>
      )}

      <div className={styles.acciones}>
        {paso > 1 && (
          <Button variant="ghost" onClick={retroceder} disabled={loading}>
            Atrás
          </Button>
        )}
        {paso < 4 ? (
          <Button variant="primary" onClick={avanzar}>
            Siguiente
          </Button>
        ) : (
          <Button variant="primary" loading={loading} onClick={() => void enviar()}>
            {mode === "salida" ? "Registrar salida" : "Registrar devolución"}
          </Button>
        )}
      </div>
    </div>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div className={styles.dato}>
      <span className={styles.datoLabel}>{label}</span>
      <span className={styles.datoValor}>{valor}</span>
    </div>
  );
}

function SlotFoto({
  slot,
  file,
  previa,
  onFile,
  grande,
}: {
  slot: SlotChecklist;
  file?: File;
  previa?: string;
  onFile: (slot: SlotChecklist, file: File | null | undefined) => void;
  grande?: boolean;
}) {
  const etiqueta = ETIQUETA_SLOT[slot];
  return (
    <label
      className={[styles.slot, file ? styles.slotLleno : "", grande ? styles.slotGrande : ""]
        .filter(Boolean)
        .join(" ")}
    >
      <span className={styles.slotLabel}>{etiqueta}</span>
      {previa ? (
        // eslint-disable-next-line @next/next/no-img-element -- blob local, sin optimizar
        <img className={styles.slotPrevia} src={previa} alt={`Foto ${etiqueta}`} />
      ) : (
        <span className={styles.slotEstado}>Tomar foto</span>
      )}
      {file && <span className={styles.slotEstado}>Lista</span>}
      <input
        className={styles.slotInput}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => onFile(slot, e.target.files?.[0])}
      />
    </label>
  );
}
