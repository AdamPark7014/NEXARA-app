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

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { toast } from "@/components/Toast";
import { getStudioSectionConfig } from "@/lib/section-views";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import StudioFileInput from "@/components/studio/StudioFileInput";
import KpiCard from "@/components/ui/KpiCard";
import {
  STUDIO_IMAGE_SPECS,
  studioImageHintLine,
} from "@/lib/studio-image-specs";
import {
  createHeroSlide,
  deleteHeroSlide,
  listHeroSlides,
  reorderHeroSlides,
  resolveHeroImageUrl,
  updateHeroSlide,
  type HeroSlide,
} from "@/lib/hero-slides-api";
import {
  deleteHeroVideo,
  getHeroVideo,
  resolveHeroVideoUrl,
  uploadHeroVideo,
  type HeroVideo,
} from "@/lib/hero-video-api";
import {
  getPageSection,
  savePageSection,
  type HeroMediaConfig,
} from "@/lib/page-content-api";

const HERO_SPEC = STUDIO_IMAGE_SPECS.heroCarousel;
const VIDEO_ACCEPT = "video/mp4,video/webm";
const MAX_VIDEO_MB = 80;

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

  const [mediaType, setMediaType] = useState<"carousel" | "video">("carousel");
  const [mediaTypeLoading, setMediaTypeLoading] = useState(true);
  const [mediaTypeSaving, setMediaTypeSaving] = useState(false);
  const [video, setVideo] = useState<HeroVideo | null>(null);
  const [videoLoading, setVideoLoading] = useState(true);
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoTitle, setVideoTitle] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);

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

  const refreshVideo = useCallback(async () => {
    if (!token) return;
    setVideoLoading(true);
    try {
      const data = await getHeroVideo(token);
      setVideo(data);
    } catch (err) {
      toast.error(`No se pudo cargar el video: ${(err as Error).message}`);
    } finally {
      setVideoLoading(false);
    }
  }, [token]);

  const refreshMediaType = useCallback(async () => {
    if (!token) return;
    setMediaTypeLoading(true);
    try {
      const row = await getPageSection("home_hero", token);
      const content = row?.content as HeroMediaConfig | undefined;
      setMediaType(content?.mediaType === "video" ? "video" : "carousel");
    } catch (err) {
      toast.error(`No se pudo cargar la configuración del hero: ${(err as Error).message}`);
    } finally {
      setMediaTypeLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (isContextReady && token) {
      refresh();
      refreshVideo();
      refreshMediaType();
    }
  }, [isContextReady, token, refresh, refreshVideo, refreshMediaType]);

  const onChangeMediaType = async (next: "carousel" | "video") => {
    if (next === mediaType) return;
    setMediaTypeSaving(true);
    const previous = mediaType;
    setMediaType(next);
    try {
      await savePageSection("home_hero", { mediaType: next }, token);
      toast.success(next === "video" ? "El hero ahora muestra el video." : "El hero ahora muestra el carrusel.");
    } catch (err) {
      setMediaType(previous);
      toast.error(`No se pudo guardar: ${(err as Error).message}`);
    } finally {
      setMediaTypeSaving(false);
    }
  };

  const onVideoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setVideoFile(null);
      return;
    }
    if (!["video/mp4", "video/webm"].includes(file.type)) {
      toast.error("Formato no permitido. Usa MP4 o WEBM.");
      e.target.value = "";
      setVideoFile(null);
      return;
    }
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
      toast.error(`El archivo supera ${MAX_VIDEO_MB} MB.`);
      e.target.value = "";
      setVideoFile(null);
      return;
    }
    setVideoFile(file);
  };

  const onUploadVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoFile) {
      toast.error("Selecciona un archivo de video.");
      return;
    }
    setVideoUploading(true);
    try {
      await uploadHeroVideo(token, { file: videoFile, title: videoTitle.trim() || undefined });
      toast.success("Video del hero actualizado.");
      setVideoFile(null);
      setVideoTitle("");
      await refreshVideo();
    } catch (err) {
      toast.error(`No se pudo subir el video: ${(err as Error).message}`);
    } finally {
      setVideoUploading(false);
    }
  };

  const onDeleteVideo = () => {
    if (!video) return;
    setConfirmState({
      message: `¿Eliminar el video actual del hero? ${video.title || video.videoUrl}`,
      fn: async () => {
        try {
          await deleteHeroVideo(token, video.id);
          toast.success("Video eliminado.");
          await refreshVideo();
        } catch (err) {
          toast.error(`No se pudo eliminar: ${(err as Error).message}`);
        }
      },
    });
  };

  const activeCount = useMemo(
    () => slides.filter((s) => s.isActive).length,
    [slides],
  );

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
        subtitle={`${cfg.subtitle} Elige si el hero muestra un carrusel de imágenes o un video de fondo.`}
        variant="hero"
        meta={
          mediaType === "carousel" ? (
            <>
              <Tag variant="accent" dot>
                {slides.length} {slides.length === 1 ? "slide" : "slides"}
              </Tag>
              <Tag variant={activeCount > 0 ? "positive" : "neutral"}>
                {activeCount} visibles en producción
              </Tag>
            </>
          ) : (
            <Tag variant={video ? "positive" : "neutral"}>
              {video ? "Video configurado" : "Sin video todavía"}
            </Tag>
          )
        }
      />

      <Section
        eyebrow="Tipo de contenido"
        title="Carrusel de imágenes o video de fondo"
        subtitle="El sitio público usa lo que elijas aquí; el otro modo queda guardado pero oculto."
        tone="accent"
      >
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Button
            type="button"
            variant={mediaType === "carousel" ? "primary" : "secondary"}
            disabled={mediaTypeLoading || mediaTypeSaving}
            onClick={() => onChangeMediaType("carousel")}
          >
            🖼️ Carrusel de imágenes
          </Button>
          <Button
            type="button"
            variant={mediaType === "video" ? "primary" : "secondary"}
            disabled={mediaTypeLoading || mediaTypeSaving}
            onClick={() => onChangeMediaType("video")}
          >
            🎬 Video de fondo
          </Button>
        </div>
      </Section>

      {mediaType === "carousel" && slides.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginBottom: 18 }}>
          <KpiCard label="Total slides" value={slides.length} icon="🖼️" />
          <KpiCard label="Visibles" value={activeCount} icon="✅" variant={activeCount > 0 ? "positive" : "warning"} hint="En producción" />
          <KpiCard label="Ocultos" value={slides.length - activeCount} icon="🙈" variant={slides.length - activeCount > 0 ? "warning" : "default"} />
          <KpiCard label="Estado" value={activeCount > 0 ? "Carrusel activo" : "Sin slides visibles"} icon="📡" variant={activeCount > 0 ? "positive" : "danger"} />
        </div>
      )}

      {mediaType === "carousel" && slides.length > 0 && (
        <div style={{ marginBottom: 18, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Distribución de slides</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {[
              { label: "Visibles", count: activeCount, color: "var(--success)" },
              { label: "Ocultos", count: slides.length - activeCount, color: "var(--warning)" },
            ].filter(r => r.count > 0).map(r => (
              <div key={r.label} style={{ display: "grid", gridTemplateColumns: "80px 1fr 36px", gap: 10, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>{r.label}</span>
                <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(r.count / slides.length) * 100}%`, background: r.color, borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>{r.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {mediaType === "carousel" && (
      <>
      <Section
        eyebrow="Nuevo slide"
        title="Subir imagen al carrusel"
        subtitle={studioImageHintLine(HERO_SPEC)}
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
          <StudioFileInput
            spec={HERO_SPEC}
            label="Imagen"
            showDetailHint
            compactHint={false}
            fileName={draft.file ? `${draft.file.name} · ${(draft.file.size / 1024).toFixed(0)} KB` : null}
            onChange={(file) => setDraft((d) => ({ ...d, file }))}
            onError={(msg) => toast.error(msg)}
            inputStyle={inputStyle}
          />

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
      </>
      )}

      {mediaType === "video" && (
        <Section
          eyebrow="Video del hero"
          title="Video de fondo del inicio"
          subtitle={`MP4 o WEBM · máx. ${MAX_VIDEO_MB} MB · se reproduce en loop, sin sonido, de fondo en la home.`}
          tone="accent"
        >
          {videoLoading ? (
            <p style={{ color: "var(--text-tertiary)", padding: "24px 0" }}>Cargando…</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {video ? (
                <article
                  style={{
                    display: "grid",
                    gridTemplateColumns: "240px 1fr auto",
                    gap: 16,
                    padding: 14,
                    borderRadius: 14,
                    background: "var(--surface)",
                    border: "1px solid var(--nx-panel-hairline)",
                    boxShadow: "var(--nx-panel-elev-1)",
                  }}
                >
                  <video
                    src={resolveHeroVideoUrl(video.videoUrl)}
                    controls
                    muted
                    style={{ width: "100%", height: 140, borderRadius: 10, background: "#0a1419", objectFit: "cover" }}
                  />
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0, justifyContent: "center" }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{video.title || "Video sin título"}</span>
                    <Tag variant="positive" size="sm">Video activo en producción</Tag>
                    <code style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{video.videoUrl}</code>
                  </div>
                  {cfg.canDelete && (
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <Button size="sm" variant="ghost" onClick={onDeleteVideo} style={{ color: "var(--danger)" }}>
                        Eliminar
                      </Button>
                    </div>
                  )}
                </article>
              ) : (
                <p style={{ color: "var(--text-tertiary)" }}>
                  Aún no hay video configurado. Mientras tanto, la home usa el carrusel de imágenes como respaldo.
                </p>
              )}

              <form
                onSubmit={onUploadVideo}
                style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) auto", gap: 12, alignItems: "end" }}
              >
                <label style={fieldStyle}>
                  <span style={labelStyle}>{video ? "Reemplazar video" : "Subir video"}</span>
                  <input type="file" accept={VIDEO_ACCEPT} onChange={onVideoFileChange} style={inputStyle} />
                </label>
                <label style={fieldStyle}>
                  <span style={labelStyle}>Título (opcional)</span>
                  <input
                    type="text"
                    value={videoTitle}
                    onChange={(e) => setVideoTitle(e.target.value)}
                    placeholder="Ej. Reel institucional 2026"
                    style={inputStyle}
                    maxLength={200}
                  />
                </label>
                <Button type="submit" variant="primary" disabled={videoUploading || !videoFile}>
                  {videoUploading ? "Subiendo…" : video ? "Reemplazar" : "Subir"}
                </Button>
              </form>
            </div>
          )}
        </Section>
      )}
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
