"use client";

import type { ToolRequestStatus } from "@/lib/tool-requests-api";

type TimelineProps = {
  status: ToolRequestStatus;
  requestDate?: string | null;
  approvalDate?: string | null;
  pickedUpAt?: string | null;
  deliveryDate?: string | null;
  returnDate?: string | null;
};

const STEPS = [
  { key: "request", label: "Solicitud" },
  { key: "approve", label: "Aprobación" },
  { key: "pickup", label: "Recolección" },
  { key: "deliver", label: "Entrega" },
  { key: "return", label: "Devolución" },
] as const;

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

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${STEPS.length}, minmax(0, 1fr))`,
        gap: 4,
        marginTop: 6,
      }}
      aria-label="Línea de tiempo del préstamo"
    >
      {STEPS.map((step, i) => {
        const done = !rejected && i <= active;
        const current = !rejected && i === active;
        return (
          <div key={step.key} style={{ textAlign: "center" }}>
            <div
              style={{
                height: 6,
                borderRadius: 99,
                background: rejected
                  ? "var(--danger)"
                  : done
                    ? "var(--primary)"
                    : "var(--border)",
                opacity: current ? 1 : done ? 0.85 : 0.5,
              }}
            />
            <div
              style={{
                fontSize: 10,
                marginTop: 4,
                fontWeight: current ? 700 : 500,
                color: done ? "var(--foreground)" : "var(--text-secondary)",
              }}
            >
              {step.label}
            </div>
            {stamps[i] && (
              <div style={{ fontSize: 9, color: "var(--text-tertiary)" }}>{stamps[i]}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
