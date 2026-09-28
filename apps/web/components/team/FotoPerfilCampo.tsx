"use client";

/**
 * Foto de perfil fija: archivo o cámara, recorte cuadrado centrado, vista en círculo.
 * Lo que sale de aquí es un JPEG cuadrado; el API lo guarda en `User.avatarUrl`.
 */
import { useRef, useState } from "react";
import Button from "@/components/ui/Button";
import { LADO_AVATAR, recorteCuadradoCentrado } from "@/lib/recorte-cuadrado";

const MAX_BYTES = 12 * 1024 * 1024;

function cargarImagen(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo leer la foto."));
    img.src = url;
  });
}

/** Recorta al centro y devuelve un JPEG cuadrado de a lo más 512 px. */
export async function archivoACuadrado(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) throw new Error("Elige una imagen (JPG, PNG o WEBP).");
  if (file.size > MAX_BYTES) throw new Error("La foto pesa más de 12 MB.");
  const url = URL.createObjectURL(file);
  try {
    const img = await cargarImagen(url);
    const rec = recorteCuadradoCentrado(img.naturalWidth, img.naturalHeight);
    if (!rec) throw new Error("No se pudo leer la foto.");
    const lado = Math.min(LADO_AVATAR, rec.lado);
    const canvas = document.createElement("canvas");
    canvas.width = lado;
    canvas.height = lado;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo recortar la foto.");
    ctx.drawImage(img, rec.x, rec.y, rec.lado, rec.lado, 0, 0, lado, lado);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) throw new Error("No se pudo recortar la foto.");
    return new File([blob], "avatar.jpg", { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function FotoPerfilCampo({
  previewUrl,
  onChange,
}: {
  previewUrl: string | null;
  onChange: (file: File | null, previewUrl: string | null) => void;
}) {
  const archivoRef = useRef<HTMLInputElement>(null);
  const camaraRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);

  const tomar = async (lista: FileList | null) => {
    const file = lista?.[0];
    if (!file) return;
    setLeyendo(true);
    setError(null);
    try {
      const cuadrado = await archivoACuadrado(file);
      onChange(cuadrado, URL.createObjectURL(cuadrado));
    } catch (err) {
      onChange(null, null);
      setError(err instanceof Error ? err.message : "No se pudo usar esa foto.");
    } finally {
      setLeyendo(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Foto de perfil</span>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <span
          style={{
            width: 96,
            height: 96,
            borderRadius: "50%",
            overflow: "hidden",
            border: "2px solid var(--border)",
            background: "var(--surface-2)",
            display: "grid",
            placeItems: "center",
            flex: "0 0 auto",
          }}
        >
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <span style={{ fontSize: 12, color: "var(--text-tertiary)", textAlign: "center", padding: 8 }}>Sin foto</span>
          )}
        </span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button type="button" variant="secondary" disabled={leyendo} onClick={() => camaraRef.current?.click()}>
            Tomar foto
          </Button>
          <Button type="button" variant="secondary" disabled={leyendo} onClick={() => archivoRef.current?.click()}>
            Elegir archivo
          </Button>
          {previewUrl ? (
            <Button type="button" variant="ghost" onClick={() => onChange(null, null)}>
              Quitar
            </Button>
          ) : null}
        </div>
      </div>
      <input
        ref={camaraRef}
        type="file"
        accept="image/*"
        capture="user"
        hidden
        onChange={(e) => {
          void tomar(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={archivoRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => {
          void tomar(e.target.files);
          e.target.value = "";
        }}
      />
      <span style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.45 }}>
        Se recorta al centro en un cuadrado y se muestra en círculo. Es la foto fija del perfil, no la de entrada ni la de salida. Se puede cambiar después.
      </span>
      {error ? <span style={{ fontSize: 12, color: "var(--danger)" }}>{error}</span> : null}
    </div>
  );
}
