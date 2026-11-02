"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/base";
import FileDropzone from "@/components/ui/FileDropzone";
import s from "./ReceiptCapture.module.css";

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
    <div className={s.caja}>
      {showCamera && (
        <>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            fullWidth
            disabled={disabled}
            onClick={() => cameraRef.current?.click()}
          >
            Tomar foto del ticket
          </Button>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            aria-label="Tomar foto del ticket con la cámara"
            className={s.oculto}
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
        <div className={s.adjunto}>
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Vista previa del ticket" className={s.miniatura} />
          )}
          <span className={s.archivo}>
            {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
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
