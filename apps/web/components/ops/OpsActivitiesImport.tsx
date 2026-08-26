"use client";

import { useRef, useState } from "react";
import { buildApiUrl } from "@/lib/api-base";
import Button from "@/components/ui/Button";

type Props = {
  token: string;
  onImported?: () => void;
};

/** Importación Excel de OT — extraído del legacy `ActivitiesTable`. */
export default function OpsActivitiesImport({ token, onImported }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const onFile = async (file: File) => {
    if (!token) return;
    setUploading(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(buildApiUrl("activities/import"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) throw new Error(await res.text().catch(() => "Error al importar"));
      const body = await res.json().catch(() => ({}));
      const created = typeof body?.created === "number" ? body.created : null;
      setMessage(
        created != null ? `Importación OK — ${created} actividades creadas.` : "Importación completada.",
      );
      onImported?.();
    } catch (e) {
      setMessage(`Error: ${(e as Error).message}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
        }}
      />
      <Button
        variant="secondary"
        size="sm"
        disabled={uploading || !token}
        onClick={() => fileInputRef.current?.click()}
      >
        {uploading ? "Importando…" : "Importar Excel"}
      </Button>
      {message && (
        <span
          style={{
            fontSize: 12,
            color: message.startsWith("Error") ? "var(--danger)" : "var(--success)",
          }}
        >
          {message}
        </span>
      )}
    </div>
  );
}
