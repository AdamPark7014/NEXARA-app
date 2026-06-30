"use client";

import {
  formatStudioImageSize,
  studioImageHintLine,
  type StudioImageSpec,
} from "@/lib/studio-image-specs";

type Props = {
  spec: StudioImageSpec;
  /** Texto compacto bajo el input; false = bloque con detalle */
  compact?: boolean;
  style?: React.CSSProperties;
};

export default function StudioImageHint({ spec, compact = false, style }: Props) {
  if (compact) {
    return (
      <p
        style={{
          margin: "4px 0 0",
          fontSize: 11,
          lineHeight: 1.45,
          color: "var(--text-tertiary)",
          ...style,
        }}
      >
        {studioImageHintLine(spec)}
      </p>
    );
  }

  return (
    <div
      style={{
        marginTop: 6,
        padding: "10px 12px",
        borderRadius: 8,
        border: "1px solid color-mix(in srgb, var(--primary) 22%, var(--border))",
        background: "color-mix(in srgb, var(--primary) 6%, var(--surface))",
        fontSize: 11.5,
        lineHeight: 1.5,
        color: "var(--text-secondary)",
        ...style,
      }}
    >
      <div style={{ fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
        Medidas óptimas: {formatStudioImageSize(spec)} ({spec.ratio})
      </div>
      <div>{spec.formats} · máx. {spec.maxSizeMb} MB</div>
      <div style={{ marginTop: 4, color: "var(--text-tertiary)" }}>{spec.usage}</div>
      {spec.tip ? (
        <div style={{ marginTop: 4, fontStyle: "italic", color: "var(--text-tertiary)" }}>
          {spec.tip}
        </div>
      ) : null}
    </div>
  );
}
