"use client";

import { useEffect, useMemo, useRef } from "react";
import styles from "./DurationWheelPicker.module.css";

export type DurationValue = { horas: number; minutos: number };

/** Minutos totales → horas + minutos (0–59). */
export function splitMinutes(total: number): DurationValue {
  const n = Math.max(0, Math.floor(Number(total) || 0));
  return { horas: Math.floor(n / 60), minutos: n % 60 };
}

/** Horas + minutos → minutos totales. */
export function joinMinutes(horas: number, minutos: number): number {
  return Math.max(0, Math.floor(horas) || 0) * 60 + Math.max(0, Math.min(59, Math.floor(minutos) || 0));
}

export function formatDuration(horas: number, minutos: number): string {
  const h = Math.max(0, Math.floor(horas) || 0);
  const m = Math.max(0, Math.min(59, Math.floor(minutos) || 0));
  if (h <= 0 && m <= 0) return "Sin tiempo";
  if (h <= 0) return `${m} min`;
  if (m <= 0) return h === 1 ? "1 h" : `${h} h`;
  return `${h} h ${m} min`;
}

const ITEM_H = 44;

type WheelProps = {
  values: number[];
  value: number;
  onChange: (n: number) => void;
  label: string;
  format?: (n: number) => string;
  ariaLabel: string;
};

function WheelColumn({ values, value, onChange, label, format, ariaLabel }: WheelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const scrolling = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || scrolling.current) return;
    const idx = Math.max(0, values.indexOf(value));
    el.scrollTop = idx * ITEM_H;
  }, [value, values]);

  const onScrollEnd = () => {
    const el = ref.current;
    if (!el) return;
    const idx = Math.round(el.scrollTop / ITEM_H);
    const clamped = Math.max(0, Math.min(values.length - 1, idx));
    const next = values[clamped] ?? 0;
    if (next !== value) onChange(next);
    el.scrollTo({ top: clamped * ITEM_H, behavior: "smooth" });
  };

  return (
    <div className={styles.col}>
      <span className={styles.label}>{label}</span>
      <div className={styles.wheelShell}>
        <div
          ref={ref}
          className={styles.wheel}
          role="listbox"
          aria-label={ariaLabel}
          aria-activedescendant={`${ariaLabel}-${value}`}
          tabIndex={0}
          onScroll={() => {
            scrolling.current = true;
          }}
          onTouchEnd={onScrollEnd}
          onMouseUp={onScrollEnd}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const idx = values.indexOf(value);
              const nextIdx =
                e.key === "ArrowDown"
                  ? Math.min(values.length - 1, idx + 1)
                  : Math.max(0, idx - 1);
              onChange(values[nextIdx] ?? value);
            }
          }}
          onScrollCapture={() => {
            window.clearTimeout((ref.current as HTMLDivElement & { _t?: number })?._t);
            const el = ref.current as HTMLDivElement & { _t?: number };
            if (!el) return;
            el._t = window.setTimeout(() => {
              scrolling.current = false;
              onScrollEnd();
            }, 80);
          }}
        >
          <div className={styles.pad} aria-hidden />
          {values.map((n) => (
            <button
              key={n}
              type="button"
              id={`${ariaLabel}-${n}`}
              role="option"
              aria-selected={n === value}
              className={styles.option}
              data-active={n === value ? "true" : "false"}
              onClick={() => onChange(n)}
            >
              {format ? format(n) : String(n).padStart(2, "0")}
            </button>
          ))}
          <div className={styles.pad} aria-hidden />
        </div>
        <div className={styles.highlight} aria-hidden />
      </div>
    </div>
  );
}

/**
 * Selector tipo rueda (timer) de horas + minutos. Más cómodo que un solo campo
 * en minutos cuando el trabajo dura varias horas.
 */
export function DurationWheelPicker({
  horas,
  minutos,
  onChange,
  maxHoras = 24,
  minuteStep = 5,
  label,
  hint,
  id,
}: {
  horas: number;
  minutos: number;
  onChange: (next: DurationValue) => void;
  maxHoras?: number;
  /** Paso de minutos (1 o 5). */
  minuteStep?: 1 | 5;
  label?: string;
  hint?: string;
  id?: string;
}) {
  const hourValues = useMemo(
    () => Array.from({ length: Math.max(1, maxHoras) + 1 }, (_, i) => i),
    [maxHoras],
  );
  const minuteValues = useMemo(() => {
    const step = minuteStep === 1 ? 1 : 5;
    return Array.from({ length: Math.floor(59 / step) + 1 }, (_, i) => i * step);
  }, [minuteStep]);

  const h = Math.max(0, Math.min(maxHoras, Math.floor(horas) || 0));
  // Alinea al paso más cercano (p. ej. 7 → 5 o 10).
  const mRaw = Math.max(0, Math.min(59, Math.floor(minutos) || 0));
  const m =
    minuteValues.includes(mRaw)
      ? mRaw
      : minuteValues.reduce((best, n) => (Math.abs(n - mRaw) < Math.abs(best - mRaw) ? n : best), 0);

  return (
    <div className={styles.wrap} id={id}>
      {label ? <div className={styles.summary}>{label}</div> : null}
      <div className={styles.summary} aria-live="polite">
        {formatDuration(h, m)}
      </div>
      <div className={styles.wheels}>
        <WheelColumn
          label="Horas"
          ariaLabel="horas"
          values={hourValues}
          value={h}
          onChange={(next) => onChange({ horas: next, minutos: m })}
        />
        <WheelColumn
          label="Minutos"
          ariaLabel="minutos"
          values={minuteValues}
          value={m}
          onChange={(next) => onChange({ horas: h, minutos: next })}
        />
      </div>
      {hint ? <p className={styles.hint}>{hint}</p> : null}
    </div>
  );
}
