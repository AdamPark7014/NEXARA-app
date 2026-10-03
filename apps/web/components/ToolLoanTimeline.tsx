"use client";

import type { ToolRequestStatus } from "@/lib/tool-requests-api";
import s from "./ToolLoanTimeline.module.css";

type TimelineProps = {
  status: ToolRequestStatus;
  requestDate?: string | null;
  approvalDate?: string | null;
  pickedUpAt?: string | null;
  deliveryDate?: string | null;
  returnDate?: string | null;
  /**
   * Versión de tabla: solo las barras y, debajo, el paso en curso con su hora.
   * Las etiquetas de cada paso quedan para el lector de pantalla y el `title`.
   */
  compact?: boolean;
};

const STEPS = [
  { key: "request", label: "Solicitud" },
  { key: "approve", label: "Aprobación" },
  { key: "pickup", label: "Recolección" },
  { key: "deliver", label: "Entrega" },
  { key: "return", label: "Devolución" },
] as const;

type StepState = "done" | "current" | "todo" | "rejected";

function stepIndex(status: ToolRequestStatus): number {
  switch (status) {
    case "PENDING":
      return 0;
    case "APPROVED":
      return 1;
    case "IN_USE":
      return 3;
    case "RETURNED":
    case "DAMAGED":
      return 4;
    case "REJECTED":
      return 0;
    default:
      return 0;
  }
}

function fmt(iso?: string | null) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("es-MX", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}

export default function ToolLoanTimeline({
  status,
  requestDate,
  approvalDate,
  pickedUpAt,
  deliveryDate,
  returnDate,
  compact = false,
}: TimelineProps) {
  const active = stepIndex(status);
  const rejected = status === "REJECTED";
  const stamps = [
    fmt(requestDate),
    fmt(approvalDate),
    fmt(pickedUpAt),
    fmt(deliveryDate || pickedUpAt),
    fmt(returnDate),
  ];

  const stateOf = (i: number): StepState => {
    if (rejected) return "rejected";
    if (i === active) return "current";
    return i < active ? "done" : "todo";
  };

  const steps = (
    <ol className={compact ? `${s.timeline} ${s.compactBars}` : s.timeline} aria-label="Línea de tiempo del préstamo">
      {STEPS.map((step, i) => {
        const state = stateOf(i);
        const stamp = stamps[i];
        return (
          <li
            key={step.key}
            className={s.step}
            data-state={state}
            aria-current={state === "current" ? "step" : undefined}
            title={compact ? [step.label, stamp].filter(Boolean).join(" · ") : undefined}
          >
            <span className={s.bar} aria-hidden="true" />
            {compact ? (
              <span className="ui-sr-only">
                {step.label}
                {stamp ? `, ${stamp}` : ""}
              </span>
            ) : (
              <>
                <span className={s.label}>{step.label}</span>
                {stamp ? <span className={s.stamp}>{stamp}</span> : null}
              </>
            )}
          </li>
        );
      })}
    </ol>
  );

  if (!compact) return steps;

  const actual = STEPS[active];
  const sello = stamps[active];
  return (
    <div className={s.compact}>
      {steps}
      <span className={s.caption} data-rejected={rejected ? "true" : undefined} aria-hidden="true">
        {rejected ? `Detenida en ${STEPS[0].label.toLowerCase()}` : actual.label}
        {!rejected && sello ? <span className={s.captionStamp}> · {sello}</span> : null}
      </span>
    </div>
  );
}
