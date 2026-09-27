"use client";

import { useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import FileDropzone from "@/components/ui/FileDropzone";

/**
 * Comprobante de un gasto o viático: arrastrar o elegir archivo en escritorio
 * y, en el teléfono, un botón que abre directo la cámara trasera. Si es imagen
 * se enseña la miniatura para confirmar que el ticket se lee antes de enviarlo.
 */
export default function ReceiptCapture({
  file,
  onFile,
  label,
  hint,
  required,
  showCamera,
  disabled,
}: {
  file: File | null;
  onFile: (file: File | null) => void;
  label: string;
  hint?: string;
  required?: boolean;
  /** En pantallas angostas: botón «Tomar foto del ticket». */
  showCamera?: boolean;
  disabled?: boolean;
}) {
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {showCamera && (
        <>
          <Button
            type="button"
            variant="secondary"
            fullWidth
            disabled={disabled}
            onClick={() => cameraRef.current?.click()}
            style={{ height: 44, fontSize: 14 }}
          >
            Tomar foto del ticket
          </Button>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            aria-label="Tomar foto del ticket con la cámara"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
        </>
      )}
      <FileDropzone file={file} onFile={onFile} label={label} hint={hint} required={required} />
      {file && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Vista previa del ticket"
              style={{
                width: 56,
                height: 56,
                objectFit: "cover",
                borderRadius: 8,
                border: "1px solid var(--border)",
                flexShrink: 0,
              }}
            />
          )}
          <span style={{ fontSize: 12, color: "var(--text-secondary)", minWidth: 0, overflowWrap: "anywhere" }}>
            {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            style={{ height: 28, fontSize: 12, padding: "0 9px" }}
            disabled={disabled}
            onClick={() => onFile(null)}
            aria-label="Quitar el comprobante adjunto"
          >
            Quitar
          </Button>
        </div>
      )}
    </div>
  );
}
