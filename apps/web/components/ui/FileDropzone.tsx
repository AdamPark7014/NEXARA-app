"use client";

import { useRef, useState, type ReactNode } from "react";

type Props = {
  file: File | null;
  onFile: (file: File | null) => void;
  accept?: string;
  label?: string;
  hint?: string;
  required?: boolean;
};

export default function FileDropzone({ file, onFile, accept = "image/*,.pdf", label, hint, required }: Props) {
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const pick = (f: File | null) => {
    if (!f) return;
    onFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) pick(f);
  };

  return (
    <div>
      {label ? (
        <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
          {label}{required ? " *" : ""}
        </div>
      ) : null}
      <div
        onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragActive ? "var(--primary)" : "var(--border)"}`,
          borderRadius: 12,
          padding: "18px 16px",
          textAlign: "center",
          cursor: "pointer",
          background: dragActive ? "var(--surface-2)" : "var(--surface)",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600 }}>Arrastra y suelta tu ticket aquí</div>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4 }}>
          {hint ?? "PDF o imagen · clic para buscar archivo"}
        </div>
        {file ? (
          <div style={{ marginTop: 10, fontSize: 12, color: "var(--primary)", fontWeight: 600 }}>
            ✓ {file.name}
          </div>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          style={{ display: "none" }}
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
        />
      </div>
    </div>
  );
}

export function FilePreviewNote({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 6 }}>{children}</div>;
}
