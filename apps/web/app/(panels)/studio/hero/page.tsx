"use client";

/**
 * Studio · Banner del inicio (`/studio/hero`)
 * --------------------------------------------
 * Gestión visual del carrusel del home (`/`).
 *
 * - Lista las imágenes existentes con thumb, alt y orden.
 * - Permite subir nuevas imágenes (JPG/PNG/WEBP/GIF hasta 5 MB).
 * - Reordenar con flechas ↑/↓ (persistido al servidor).
 * - Toggle activo/inactivo (oculta el slide en producción sin borrarlo).
 * - Eliminar definitivamente.
 *
 * Backend: `apps/api/src/hero-slides/`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { toast } from "@/components/Toast";
import { getStudioSectionConfig } from "@/lib/section-views";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import {
  createHeroSlide,
  deleteHeroSlide,
  listHeroSlides,
  reorderHeroSlides,
  resolveHeroImageUrl,
  updateHeroSlide,
  type HeroSlide,
} from "@/lib/hero-slides-api";

const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export default function StudioHeroPage() {
  const { user, isContextReady } = useUser();
  const cfg = useMemo(() => getStudioSectionConfig(user, "hero"), [user]);
  const token = user?.token ?? "";

  const [slides, setSlides] = useState<HeroSlide[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState<number | null>(null);
  const [draft, setDraft] = useState({
    altText: "",
    href: "",
    file: null as File | null,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await listHeroSlides(token);
      setSlides(data);
    } catch (err) {
      toast.error(`No se pudo cargar el banner: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (isContextReady && token) refresh();
  }, [isContextReady, token, refresh]);

  const activeCount = useMemo(
    () => slides.filter((s) => s.isActive).length,
    [slides],
  );

  // ── Validación de archivo en cliente ─────────────────────────────
  const validateFile = (file: File): string | null => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return "Formato no permitido. Usa JPG, PNG, WEBP o GIF.";
    }
    if (file.size > MAX_SIZE_BYTES) {
      return "El archivo supera 5 MB.";
    }
    return null;
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const error = validateFile(file);
    if (error) {
      toast.error(error);
      e.target.value = "";
      return;
    }
    setDraft((d) => ({ ...d, file }));
  };

  // ── Crear ─────────────────────────────────────────────────────────
  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.file) {
      toast.error("Selecciona una imagen para el slide.");
      return;
    }
    setUploading(true);
    try {
      await createHeroSlide(token, {
        file: draft.file,
        altText: draft.altText.trim() || undefined,
        href: draft.href.trim() || undefined,
      });
      toast.success("Slide añadido al carrusel.");
      setDraft({ altText: "", href: "", file: null });
      if (fileInputRef.current) fileInputRef.current.value = "";
      await refresh();
    } catch (err) {
      toast.error(`No se pudo guardar: ${(err as Error).message}`);
    } finally {
      setUploading(false);
    }
  };

  // ── Toggle activo / inactivo ─────────────────────────────────────
  const onToggleActive = async (slide: HeroSlide) => {
    setPending(slide.id);
    try {
      await updateHeroSlide(token, slide.id, { isActive: !slide.isActive });
      await refresh();
    } catch (err) {
      toast.error(`No se pudo actualizar: ${(err as Error).message}`);
    } finally {
      setPending(null);
    }
  };

  // ── Editar alt / href inline ─────────────────────────────────────
  const onUpdateMeta = async (slide: HeroSlide, field: "altText" | "href", value: string) => {
    setPending(slide.id);
    try {
      await updateHeroSlide(token, slide.id, { [field]: value });
      await refresh();
    } catch (err) {
      toast.error(`No se pudo guardar: ${(err as Error).message}`);
    } finally {
      setPending(null);
    }
  };

  // ── Eliminar ─────────────────────────────────────────────────────
  const onDelete = async (slide: HeroSlide) => {
    setConfirmState({ message: `¿Eliminar este slide del carrusel? ${slide.altText || slide.imageUrl}`, fn: async () => {
    setPending(slide.id);
    try {
      await deleteHeroSlide(token, slide.id);
      toast.success("Slide eliminado.");
      await refresh();
    } catch (err) {
      toast.error(`No se pudo eliminar: ${(err as Error).message}`);
    } finally {
      setPending(null);
    }
  } });
  };

  // ── Reordenar ↑ / ↓ ──────────────────────────────────────────────
  const move = async (index: number, dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= slides.length) return;
    const reordered = [...slides];
    [reordered[index], reordered[next]] = [reordered[next], reordered[index]];
    setSlides(reordered); // optimistic
    try {
      await reorderHeroSlides(token, reordered.map((s) => s.id));
    } catch (err) {
      toast.error(`No se pudo reordenar: ${(err as Error).message}`);
      await refresh();
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="STUDIO · Contenido"
        title={cfg.title}
        subtitle={`${cfg.subtitle} Aquí solo se gestionan las fotos del carrusel.`}
        variant="hero"
        meta={
          <>
            <Tag variant="accent" dot>
              {slides.length} {slides.length === 1 ? "slide" : "slides"}
            </Tag>
            <Tag variant={activeCount > 0 ? "positive" : "neutral"}>
              {activeCount} visibles en producción
            </Tag>
          </>
        }
      />

      <Section
        eyebrow="Nuevo slide"
        title="Subir imagen al carrusel"
        subtitle="Formatos JPG, PNG, WEBP o GIF. Hasta 5 MB. Se recomienda 1920×1080 px."
        tone="accent"
      >
        <form
          onSubmit={onCreate}
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) auto",
            gap: 12,
            alignItems: "end",
          }}
        >
          <label style={fieldStyle}>
            <span style={labelStyle}>Imagen</span>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(",")}
              onChange={onFileChange}
              style={inputStyle}
            />
            {draft.file && (
              <span style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
                {draft.file.name} · {(draft.file.size / 1024).toFixed(0)} KB
              </span>
            )}
          </label>

          <label style={fieldStyle}>
            <span style={labelStyle}>Texto alternativo (accesibilidad)</span>
            <input
              type="text"
              value={draft.altText}
              onChange={(e) => setDraft((d) => ({ ...d, altText: e.target.value }))}
              placeholder="Ej. Equipo NEXARA en instalación de CCTV"
              style={inputStyle}
              maxLength={200}
            />
          </label>

          <label style={fieldStyle}>
            <span style={labelStyle}>Enlace al hacer click (opcional)</span>
            <input
              type="text"
              value={draft.href}
              onChange={(e) => setDraft((d) => ({ ...d, href: e.target.value }))}
              placeholder="/proyectos/soriana"
              style={inputStyle}
              maxLength={500}
            />
          </label>

          <Button type="submit" variant="primary" disabled={uploading || !draft.file}>
            {uploading ? "Subiendo…" : "Añadir"}
          </Button>
        </form>
      </Section>

      <Section
        eyebrow="Carrusel actual"
        title="Slides del home"
        subtitle="Reordena con ↑/↓. Desactiva un slide para ocultarlo del sitio sin borrarlo."
      >
        {loading ? (
          <p style={{ color: "var(--text-tertiary)", padding: "24px 0" }}>Cargando…</p>
        ) : slides.length === 0 ? (
          <p style={{ color: "var(--text-tertiary)", padding: "24px 0" }}>
            Aún no hay slides. Sube el primero arriba.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {slides.map((slide, index) => {
              const imgSrc = resolveHeroImageUrl(slide.imageUrl);
              const isPending = pending === slide.id;
              return (
                <article
                  key={slide.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "160px 1fr auto",
                    gap: 16,
                    padding: 14,
                    borderRadius: 14,
                    background: "var(--surface)",
                    border: "1px solid var(--nx-panel-hairline)",
                    boxShadow: "var(--nx-panel-elev-1)",
                    opacity: isPending ? 0.6 : 1,
                    transition: "opacity 180ms ease",
                  }}
                >
                  {/* Thumb */}
                  <div
                    style={{
                      position: "relative",
                      width: 160,
                      height: 100,
                      borderRadius: 10,
                      overflow: "hidden",
                      background: "#0a1419",
                    }}
                  >
                    {imgSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imgSrc}
                        alt={slide.altText || `Slide ${index + 1}`}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : null}
                    <span
                      style={{
                        position: "absolute",
                        top: 6,
                        left: 6,
                        background: "rgba(0,0,0,0.65)",
                        color: "#fff",
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 999,
                      }}
                    >
                      #{index + 1}
                    </span>
                  </div>

                  {/* Meta editable */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                    <input
                      type="text"
                      defaultValue={slide.altText || ""}
                      placeholder="Texto alternativo"
                      onBlur={(e) => {
                        const val = e.target.value.trim();
                        if (val !== (slide.altText || "")) onUpdateMeta(slide, "altText", val);
                      }}
                      style={{ ...inputStyle, fontWeight: 600, fontSize: 14 }}
                      maxLength={200}
                    />
                    <input
                      type="text"
                      defaultValue={slide.href || ""}
                      placeholder="Enlace al hacer click (opcional)"
                      onBlur={(e) => {
                        const val = e.target.value.trim();
                        if (val !== (slide.href || "")) onUpdateMeta(slide, "href", val);
                      }}
                      style={{ ...inputStyle, fontSize: 12, color: "var(--text-secondary)" }}
                      maxLength={500}
                    />
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 2 }}>
                      <Tag variant={slide.isActive ? "positive" : "neutral"} size="sm">
                        {slide.isActive ? "Visible" : "Oculto"}
                      </Tag>
                      <code style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                        {slide.imageUrl}
                      </code>
                    </div>
                  </div>

                  {/* Acciones */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Subir"
                        onClick={() => move(index, -1)}
                        disabled={index === 0 || isPending}
                      >
                        ↑
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Bajar"
                        onClick={() => move(index, 1)}
                        disabled={index === slides.length - 1 || isPending}
                      >
                        ↓
                      </Button>
                    </div>
                    <Button
                      size="sm"
                      variant={slide.isActive ? "secondary" : "primary"}
                      onClick={() => onToggleActive(slide)}
                      disabled={isPending}
                    >
                      {slide.isActive ? "Ocultar" : "Mostrar"}
                    </Button>
                    {cfg.canDelete && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onDelete(slide)}
                        disabled={isPending}
                        style={{ color: "var(--danger)" }}
                      >
                        Eliminar
                      </Button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Section>
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}

const fieldStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  minWidth: 0,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--text-tertiary)",
};

const inputStyle: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: 10,
  border: "1px solid var(--nx-panel-hairline)",
  background: "var(--surface-elevated, var(--surface))",
  color: "var(--text-primary)",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
  minWidth: 0,
};
