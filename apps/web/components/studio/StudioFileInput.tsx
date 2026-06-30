"use client";

import StudioImageHint from "@/components/studio/StudioImageHint";
import {
  STUDIO_IMAGE_ACCEPT,
  validateStudioImageFile,
  type StudioImageSpec,
} from "@/lib/studio-image-specs";

type Props = {
  spec: StudioImageSpec;
  label: string;
  onChange: (file: File | null) => void;
  onError?: (message: string) => void;
  accept?: string;
  compactHint?: boolean;
  showDetailHint?: boolean;
  inputStyle?: React.CSSProperties;
  labelStyle?: React.CSSProperties;
  fileName?: string | null;
};

export default function StudioFileInput({
  spec,
  label,
  onChange,
  onError,
  accept = STUDIO_IMAGE_ACCEPT,
  compactHint = true,
  showDetailHint = false,
  inputStyle,
  labelStyle,
  fileName,
}: Props) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      onChange(null);
      return;
    }
    const error = validateStudioImageFile(file, spec);
    if (error) {
      onError?.(error);
      e.target.value = "";
      onChange(null);
      return;
    }
    onChange(file);
  };

  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: "var(--text-tertiary)",
          ...labelStyle,
        }}
      >
        {label}
      </span>
      <input type="file" accept={accept} onChange={handleChange} style={inputStyle} />
      {fileName ? (
        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{fileName}</span>
      ) : null}
      {compactHint ? <StudioImageHint spec={spec} compact /> : null}
      {showDetailHint ? <StudioImageHint spec={spec} compact={false} /> : null}
    </label>
  );
}
