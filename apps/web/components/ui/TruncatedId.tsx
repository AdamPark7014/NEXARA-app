"use client";

import { useState } from "react";

export default function TruncatedId({ value, label = "UUID", keep = 8 }: { value: string; label?: string; keep?: number }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  };

  const truncatedValue = value.length > keep ? `${value.substring(0, keep)}…` : value;

  return (
    <div style={{ whiteSpace: "nowrap" }}>
      <code style={{ fontSize: "11.5px", letterSpacing: "0.01em", color: "var(--text-tertiary)" }}>{truncatedValue}</code>
      <button
        onClick={handleCopy}
        style={{
          fontSize: "11px",
          color: copied ? "var(--success)" : "var(--text-tertiary)",
          backgroundColor: "transparent",
          border: "none",
          cursor: "pointer",
          padding: "0",
        }}
        title={copied ? "Copiado" : `Copiar ${label}`}
        aria-label={copied ? "Copiado" : `Copiar ${label}`}
      >
        {copied ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}