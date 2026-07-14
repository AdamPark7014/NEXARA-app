"use client";

import { useId, useRef, useState } from "react";
import StudioImageHint from "@/components/studio/StudioImageHint";
import {
  STUDIO_IMAGE_ACCEPT,
  validateStudioImageFile,
  type StudioImageSpec,
} from "@/lib/studio-image-specs";
import styles from "./StudioFileInput.module.css";

type Props = {
  spec?: StudioImageSpec;
  label: string;
  onChange: (file: File | null) => void;
  onError?: (message: string) => void;
  accept?: string;
  compactHint?: boolean;
  showDetailHint?: boolean;
  /** @deprecated estilo nativo — ignorado; el dropzone tiene diseño propio */
  inputStyle?: React.CSSProperties;
  labelStyle?: React.CSSProperties;
  fileName?: string | null;
  /** Preview URL (blob o remota) opcional */
  previewUrl?: string | null;
  /** image (default) | video — valida distinto */
  kind?: "image" | "video";
  maxSizeMb?: number;
  disabled?: boolean;
};

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function StudioFileInput({
  spec,
  label,
  onChange,
  onError,
  accept = STUDIO_IMAGE_ACCEPT,
  compactHint = true,
  showDetailHint = false,
  fileName,
  previewUrl,
  kind = "image",
  maxSizeMb,
  disabled,
}: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  const acceptValue =
    accept ||
    (kind === "video" ? "video/mp4,video/webm" : STUDIO_IMAGE_ACCEPT);

  const clearLocalPreview = () => {
    setLocalPreview((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
  };

  const applyFile = (file: File | null) => {
    if (!file) {
      clearLocalPreview();
      onChange(null);
      return;
    }

    if (kind === "image" && spec) {
      const error = validateStudioImageFile(file, spec);
      if (error) {
        onError?.(error);
        onChange(null);
        clearLocalPreview();
        if (inputRef.current) inputRef.current.value = "";
        return;
      }
    } else if (kind === "video") {
      const allowed = ["video/mp4", "video/webm"];
      const limit = (maxSizeMb ?? 80) * 1024 * 1024;
      if (!allowed.includes(file.type)) {
        onError?.("Formato no permitido. Usa MP4 o WEBM.");
        onChange(null);
        if (inputRef.current) inputRef.current.value = "";
        return;
      }
      if (file.size > limit) {
        onError?.(`El archivo supera ${maxSizeMb ?? 80} MB.`);
        onChange(null);
        if (inputRef.current) inputRef.current.value = "";
        return;
      }
    }

    clearLocalPreview();
    if (kind === "image" && file.type.startsWith("image/")) {
      setLocalPreview(URL.createObjectURL(file));
    }
    onChange(file);
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    applyFile(e.target.files?.[0] ?? null);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0] ?? null;
    applyFile(file);
  };

  const shownPreview = localPreview || previewUrl || null;
  const shownName = fileName || null;
  const ratioHint = spec
    ? `${spec.width}×${spec.height} · ${spec.ratio}`
    : kind === "video"
      ? `MP4 / WEBM · máx. ${maxSizeMb ?? 80} MB`
      : null;

  return (
    <div className={styles.wrap}>
      <span className={styles.label} style={undefined}>
        {label}
      </span>

      <div
        className={`${styles.dropzone} ${dragging ? styles.dragging : ""} ${disabled ? styles.disabled : ""} ${shownPreview ? styles.hasPreview : ""}`}
        onDragEnter={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragging(false);
        }}
        onDrop={onDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        aria-label={label}
      >
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept={acceptValue}
          className={styles.hiddenInput}
          onChange={onInputChange}
          disabled={disabled}
        />

        {shownPreview && kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shownPreview} alt="" className={styles.preview} />
        ) : (
          <div className={styles.idle}>
            <span className={styles.icon} aria-hidden>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
                <path
                  d="M12 16V4m0 0l-4 4m4-4l4 4M4 14v4a2 2 0 002 2h12a2 2 0 002-2v-4"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <p className={styles.idleTitle}>
              {dragging ? "Suelta el archivo aquí" : "Arrastra y suelta"}
            </p>
            <p className={styles.idleSub}>
              o <span className={styles.browse}>elige un archivo</span>
            </p>
            {ratioHint ? <p className={styles.dims}>{ratioHint}</p> : null}
          </div>
        )}

        {shownPreview && kind === "image" ? (
          <div className={styles.overlay}>
            <span>Cambiar imagen</span>
          </div>
        ) : null}
      </div>

      {shownName ? (
        <div className={styles.metaRow}>
          <span className={styles.fileName} title={shownName}>
            {shownName}
          </span>
          <button
            type="button"
            className={styles.clearBtn}
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              applyFile(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
          >
            Quitar
          </button>
        </div>
      ) : null}

      {kind === "image" && spec && compactHint ? (
        <StudioImageHint spec={spec} compact />
      ) : null}
      {kind === "image" && spec && showDetailHint ? (
        <StudioImageHint spec={spec} compact={false} />
      ) : null}
    </div>
  );
}

export { formatBytes };
