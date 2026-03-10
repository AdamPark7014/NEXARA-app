"use client";

import React, { useMemo, useRef, useState } from "react";
import styles from "./page.module.css";
import { buildApiUrl, getApiBase } from "@/lib/api-base";

type NewsletterSubscriber = {
  id: number;
  email: string;
  name?: string | null;
  source?: string | null;
  pageUrl?: string | null;
  subscribedAt: string;
};

type NewsPost = {
  id: number;
  title: string;
  slug: string;
  summary?: string | null;
  content: string;
  coverImageUrl?: string | null;
  galleryUrls: string[];
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  tags: string[];
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

type NewsFormState = {
  title: string;
  slug: string;
  summary: string;
  content: string;
  tags: string;
  publishedAt: string;
};

const API_URL = getApiBase();
const MAX_GALLERY_IMAGES = 8;

const INITIAL_FORM: NewsFormState = {
  title: "",
  slug: "",
  summary: "",
  content: "",
  tags: "",
  publishedAt: "",
};

const splitList = (value: string) =>
  value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleString() : "Sin fecha";

const toDatetimeLocalValue = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
};

const normalizeNewsImageUrl = (imageUrl?: string | null) => {
  if (!imageUrl) return undefined;
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    return imageUrl;
  }
  if (imageUrl.startsWith("/")) {
    return `${API_URL}${imageUrl}`;
  }
  return `${API_URL}/${imageUrl}`;
};

export default function NoticiasPanel() {
  const [subscriberSearch, setSubscriberSearch] = useState("");
  const [subscribers, setSubscribers] = useState<NewsletterSubscriber[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [news, setNews] = useState<NewsPost[]>([]);
  const [newsSearch, setNewsSearch] = useState("");
  const [newsStatus, setNewsStatus] = useState("all");
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [newsForm, setNewsForm] = useState<NewsFormState>(INITIAL_FORM);
  const [slugTouched, setSlugTouched] = useState(false);
  const [savingNews, setSavingNews] = useState(false);
  const [editingNewsId, setEditingNewsId] = useState<number | null>(null);
  const [deletingNewsId, setDeletingNewsId] = useState<number | null>(null);
  const [newsFeedback, setNewsFeedback] = useState<string | null>(null);
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null);
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [coverDragActive, setCoverDragActive] = useState(false);
  const [galleryDragActive, setGalleryDragActive] = useState(false);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const resetNewsEditor = () => {
    setNewsForm(INITIAL_FORM);
    setSlugTouched(false);
    setCoverImageFile(null);
    setGalleryFiles([]);
    setEditingNewsId(null);
  };

  const fetchSubscribers = async () => {
    setLoading(true);
    setError(null);
    try {
      const query = subscriberSearch.trim()
        ? `?search=${encodeURIComponent(subscriberSearch.trim())}`
        : "";
      const response = await fetch(buildApiUrl(`newsletter${query}`), {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("No se pudieron cargar los suscriptores");
      }
      const data = (await response.json()) as NewsletterSubscriber[];
      setSubscribers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  const fetchNews = async () => {
    setNewsLoading(true);
    setNewsError(null);
    try {
      const params = new URLSearchParams();
      if (newsSearch.trim()) {
        params.set("search", newsSearch.trim());
      }
      if (newsStatus !== "all") {
        params.set("status", newsStatus);
      }
      const query = params.toString() ? `?${params.toString()}` : "";
      const response = await fetch(buildApiUrl(`news${query}`), { cache: "no-store" });
      if (!response.ok) {
        throw new Error("No se pudieron cargar las noticias");
      }
      const data = (await response.json()) as NewsPost[];
      setNews(data);
    } catch (err) {
      setNewsError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setNewsLoading(false);
    }
  };

  React.useEffect(() => {
    if (!coverImageFile) {
      setCoverPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(coverImageFile);
    setCoverPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [coverImageFile]);

  const galleryPreviewUrls = useMemo(
    () => galleryFiles.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [galleryFiles]
  );

  React.useEffect(() => {
    return () => {
      galleryPreviewUrls.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, [galleryPreviewUrls]);

  const submitNews = async (status: NewsPost["status"]) => {
    if (!newsForm.title.trim() || !newsForm.content.trim()) {
      setNewsFeedback("Completa el titulo y el contenido antes de guardar.");
      return;
    }

    setSavingNews(true);
    setNewsFeedback(null);
    try {
      const payload = {
        title: newsForm.title.trim(),
        slug: newsForm.slug.trim() || undefined,
        summary: newsForm.summary.trim() || undefined,
        content: newsForm.content.trim(),
        status,
        publishedAt: newsForm.publishedAt
          ? new Date(newsForm.publishedAt).toISOString()
          : undefined,
        tags: newsForm.tags.trim() ? splitList(newsForm.tags) : [],
      };

      const isEditing = editingNewsId !== null;
      const endpoint = isEditing ? `news/${editingNewsId}` : "news";

      if (isEditing && (coverImageFile || galleryFiles.length)) {
        throw new Error(
          "La edicion actual permite actualizar texto y estado. Para imagenes, crea una nueva noticia."
        );
      }

      const requestInit: RequestInit = isEditing
        ? {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        : (() => {
            const formData = new FormData();
            formData.append("title", payload.title);
            if (payload.slug) {
              formData.append("slug", payload.slug);
            }
            if (payload.summary) {
              formData.append("summary", payload.summary);
            }
            formData.append("content", payload.content);
            formData.append("status", payload.status);
            if (payload.publishedAt) {
              formData.append("publishedAt", payload.publishedAt);
            }
            if (payload.tags.length) {
              formData.append("tags", JSON.stringify(payload.tags));
            }
            if (coverImageFile) {
              formData.append("coverImage", coverImageFile);
            }
            if (galleryFiles.length) {
              galleryFiles.forEach((file) => formData.append("gallery", file));
            }
            return {
              method: "POST",
              body: formData,
            };
          })();

      const response = await fetch(buildApiUrl(endpoint), requestInit);

      if (!response.ok) {
        const errorText = await response.text();
        let message = "No se pudo guardar la noticia";
        try {
          const parsed = JSON.parse(errorText);
          message = parsed.message || message;
        } catch {
          message = errorText || message;
        }
        throw new Error(message);
      }

      resetNewsEditor();
      setNewsFeedback(
        isEditing
          ? "Noticia actualizada correctamente."
          : status === "PUBLISHED"
            ? "Noticia publicada."
            : "Borrador guardado."
      );
      await fetchNews();
    } catch (err) {
      setNewsFeedback(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSavingNews(false);
    }
  };

  React.useEffect(() => {
    fetchSubscribers();
    fetchNews();
  }, []);

  React.useEffect(() => {
    if (slugTouched) return;
    setNewsForm((prev) => ({
      ...prev,
      slug: slugify(prev.title),
    }));
  }, [newsForm.title, slugTouched]);

  const getImageFiles = (files: FileList | null) =>
    Array.from(files || []).filter((file) => file.type.startsWith("image/"));

  const handleCoverFile = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setNewsFeedback("Solo se permiten imagenes para la portada.");
      return;
    }
    setNewsFeedback(null);
    setCoverImageFile(file);
  };

  const handleGalleryFiles = (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (!imageFiles.length) return;
    const availableSlots = Math.max(0, MAX_GALLERY_IMAGES - galleryFiles.length);
    if (availableSlots === 0) {
      setNewsFeedback("La galeria ya tiene 8 imagenes. Elimina una para reemplazar.");
      return;
    }

    setGalleryFiles((prev) => {
      const merged = [...prev, ...imageFiles];
      if (merged.length > MAX_GALLERY_IMAGES) {
        setNewsFeedback("La galeria permite hasta 8 imagenes.");
      } else {
        setNewsFeedback(null);
      }
      return merged.slice(0, MAX_GALLERY_IMAGES);
    });
  };

  const removeGalleryFile = (index: number) => {
    setGalleryFiles((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleCoverDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setCoverDragActive(false);
    const file = event.dataTransfer.files?.[0] || null;
    handleCoverFile(file);
  };

  const handleGalleryDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setGalleryDragActive(false);
    handleGalleryFiles(getImageFiles(event.dataTransfer.files));
  };

  const handleStartEditNews = (item: NewsPost) => {
    setEditingNewsId(item.id);
    setSlugTouched(true);
    setCoverImageFile(null);
    setGalleryFiles([]);
    setNewsFeedback(null);
    setNewsForm({
      title: item.title,
      slug: item.slug,
      summary: item.summary || "",
      content: item.content,
      tags: item.tags.join(", "),
      publishedAt: toDatetimeLocalValue(item.publishedAt),
    });
  };

  const handleDeleteNews = async (item: NewsPost) => {
    const confirmed = window.confirm(`Eliminar la noticia "${item.title}"? Esta accion no se puede deshacer.`);
    if (!confirmed) return;

    setDeletingNewsId(item.id);
    setNewsFeedback(null);
    try {
      const response = await fetch(buildApiUrl(`news/${item.id}`), {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("No se pudo eliminar la noticia");
      }
      if (editingNewsId === item.id) {
        resetNewsEditor();
      }
      setNewsFeedback("Noticia eliminada correctamente.");
      await fetchNews();
    } catch (err) {
      setNewsFeedback(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setDeletingNewsId(null);
    }
  };

  const counts = useMemo(() => {
    const normalizeSource = (value?: string | null) => (value || "").toLowerCase();
    return {
      total: subscribers.length,
      footer: subscribers.filter((item) => {
        const source = normalizeSource(item.source);
        return source === "footer" || source === "newsletter-footer";
      }).length,
      contact: subscribers.filter((item) => {
        const source = normalizeSource(item.source);
        return (
          source.startsWith("contact") ||
          source.startsWith("contacto") ||
          source.includes("floating")
        );
      }).length,
    };
  }, [subscribers]);

  const newsCounts = useMemo(() => {
    return {
      total: news.length,
      published: news.filter((item) => item.status === "PUBLISHED").length,
      draft: news.filter((item) => item.status === "DRAFT").length,
    };
  }, [news]);

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Panel Web</p>
          <h1 className={styles.title}>Noticias y newsletter</h1>
          <p className={styles.subtitle}>
            Crea noticias, publica novedades y mantén tu newsletter organizada desde un solo lugar.
          </p>
        </div>
        <div className={styles.headerStats}>
          <div className={styles.statGroup}>
            <span className={styles.statLabel}>Suscriptores</span>
            <div className={styles.statRow}>
              <div className={styles.statCard}>
                <strong>{counts.total}</strong>
                <small>Total</small>
              </div>
              <div className={styles.statCard}>
                <strong>{counts.footer}</strong>
                <small>Footer</small>
              </div>
              <div className={styles.statCard}>
                <strong>{counts.contact}</strong>
                <small>Contacto</small>
              </div>
            </div>
          </div>
          <div className={styles.statGroup}>
            <span className={styles.statLabel}>Noticias</span>
            <div className={styles.statRow}>
              <div className={styles.statCard}>
                <strong>{newsCounts.total}</strong>
                <small>Total</small>
              </div>
              <div className={styles.statCard}>
                <strong>{newsCounts.published}</strong>
                <small>Publicadas</small>
              </div>
              <div className={styles.statCard}>
                <strong>{newsCounts.draft}</strong>
                <small>Borradores</small>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className={styles.panelGrid}>
        <section className={styles.card}>
          <header className={styles.cardHeader}>
            <div>
              <h2 className={styles.cardTitle}>Creador de noticias</h2>
              <p className={styles.cardSubtitle}>
                {editingNewsId
                  ? "Edita y guarda cambios de la noticia seleccionada."
                  : "Redacta, programa y publica novedades para la web y newsletter."}
              </p>
            </div>
            <span className={styles.cardBadge}>{editingNewsId ? "Editando" : "Editor"}</span>
          </header>

          <div className={styles.formGrid}>
            <label className={styles.field}>
              Titulo
              <input
                value={newsForm.title}
                onChange={(event) =>
                  setNewsForm((prev) => ({ ...prev, title: event.target.value }))
                }
                placeholder="Nueva alianza Nexara"
              />
            </label>
            <label className={styles.field}>
              Slug
              <input
                value={newsForm.slug}
                onChange={(event) => {
                  setSlugTouched(true);
                  setNewsForm((prev) => ({ ...prev, slug: event.target.value }));
                }}
                placeholder="nueva-alianza-nexara"
              />
            </label>
            <label className={styles.field}>
              Resumen
              <input
                value={newsForm.summary}
                onChange={(event) =>
                  setNewsForm((prev) => ({ ...prev, summary: event.target.value }))
                }
                placeholder="Resumen corto para destacar la noticia"
              />
            </label>
            <div className={styles.fieldWide}>
              <div className={styles.mediaGroup}>
                <div className={styles.mediaBlock}>
                  <h3>Imagen de portada</h3>
                  {coverPreviewUrl && (
                    <div className={styles.imagePreview}>
                      <div className={styles.previewItem}>
                        <img src={coverPreviewUrl} alt="Portada" />
                        <button
                          type="button"
                          className={styles.removeButton}
                          onClick={() => setCoverImageFile(null)}
                        >
                          x
                        </button>
                      </div>
                    </div>
                  )}
                  {coverImageFile && (
                    <p className={styles.helper}>Seleccionada: {coverImageFile.name}</p>
                  )}
                  <div
                    className={`${styles.dropZone} ${
                      coverDragActive ? styles.dropZoneActive : ""
                    }`}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setCoverDragActive(true);
                    }}
                    onDragLeave={() => setCoverDragActive(false)}
                    onDrop={handleCoverDrop}
                    onClick={() => coverInputRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        coverInputRef.current?.click();
                      }
                    }}
                  >
                    <p className={styles.dropHint}>Arrastra la portada aqui o haz click</p>
                  </div>
                  <input
                    ref={coverInputRef}
                    className={styles.fileInput}
                    type="file"
                    accept="image/*"
                    onChange={(event) => handleCoverFile(event.target.files?.[0] || null)}
                  />
                  <p className={styles.helper}>Sube una imagen principal para la noticia.</p>
                </div>

                <div className={styles.mediaBlock}>
                  <h3>Galeria (hasta 8 imagenes)</h3>
                  {galleryPreviewUrls.length > 0 && (
                    <div className={styles.galleryPreview}>
                      {galleryPreviewUrls.map((item, index) => (
                        <div className={styles.galleryItem} key={item.url}>
                          <div className={styles.previewItem}>
                            <img src={item.url} alt={`Galeria ${index + 1}`} />
                            <button
                              type="button"
                              className={styles.removeButton}
                              onClick={() => removeGalleryFile(index)}
                            >
                              x
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div
                    className={`${styles.dropZone} ${
                      galleryDragActive ? styles.dropZoneActive : ""
                    }`}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setGalleryDragActive(true);
                    }}
                    onDragLeave={() => setGalleryDragActive(false)}
                    onDrop={handleGalleryDrop}
                    onClick={() => galleryInputRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        galleryInputRef.current?.click();
                      }
                    }}
                  >
                    <p className={styles.dropHint}>Arrastra imagenes aqui o haz click</p>
                  </div>
                  <input
                    ref={galleryInputRef}
                    className={styles.fileInput}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(event) => handleGalleryFiles(getImageFiles(event.target.files))}
                  />
                  <p className={styles.helper}>
                    {galleryFiles.length > 0
                      ? `${galleryFiles.length}/${MAX_GALLERY_IMAGES} imagenes seleccionadas`
                      : "Selecciona hasta 8 imagenes para la galeria."}
                  </p>
                </div>
              </div>
            </div>
            <label className={styles.field}>
              Tags
              <input
                value={newsForm.tags}
                onChange={(event) =>
                  setNewsForm((prev) => ({ ...prev, tags: event.target.value }))
                }
                placeholder="innovacion, alianzas, energia"
              />
            </label>
            <label className={styles.field}>
              Programar publicacion
              <input
                type="datetime-local"
                value={newsForm.publishedAt}
                onChange={(event) =>
                  setNewsForm((prev) => ({ ...prev, publishedAt: event.target.value }))
                }
              />
            </label>
            <label className={styles.fieldWide}>
              Contenido
              <textarea
                value={newsForm.content}
                onChange={(event) =>
                  setNewsForm((prev) => ({ ...prev, content: event.target.value }))
                }
                placeholder="Escribe el contenido principal de la noticia..."
                rows={6}
              />
            </label>
          </div>

          {newsFeedback && <p className={styles.feedback}>{newsFeedback}</p>}

          <div className={styles.buttonRow}>
            {editingNewsId && (
              <button
                type="button"
                className={styles.ghostButton}
                onClick={resetNewsEditor}
                disabled={savingNews}
              >
                Cancelar edicion
              </button>
            )}
            <button
              type="button"
              className={styles.ghostButton}
              onClick={() => submitNews("DRAFT")}
              disabled={savingNews}
            >
              {savingNews
                ? "Guardando..."
                : editingNewsId
                  ? "Guardar cambios" : "Guardar borrador"}
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => submitNews("PUBLISHED")}
              disabled={savingNews}
            >
              {savingNews
                ? "Publicando..."
                : editingNewsId
                  ? "Guardar y publicar" : "Publicar"}
            </button>
          </div>
        </section>

        <section className={styles.card}>
          <header className={styles.cardHeader}>
            <div>
              <h2 className={styles.cardTitle}>Noticias recientes</h2>
              <p className={styles.cardSubtitle}>
                Gestiona las publicaciones activas y sus estados.
              </p>
            </div>
            <button
              type="button"
              className={styles.refreshButton}
              onClick={fetchNews}
              disabled={newsLoading}
            >
              {newsLoading ? "Actualizando..." : "Actualizar"}
            </button>
          </header>

          <div className={styles.newsToolbar}>
            <input
              value={newsSearch}
              onChange={(event) => setNewsSearch(event.target.value)}
              placeholder="Buscar noticia..."
            />
            <select value={newsStatus} onChange={(event) => setNewsStatus(event.target.value)}>
              <option value="all">Todas</option>
              <option value="PUBLISHED">Publicadas</option>
              <option value="DRAFT">Borradores</option>
              <option value="ARCHIVED">Archivadas</option>
            </select>
            <button type="button" className={styles.ghostButton} onClick={fetchNews} disabled={newsLoading}>
              Filtrar
            </button>
          </div>

          {newsError && <p className={styles.error}>{newsError}</p>}

          <div className={styles.newsList}>
            {news.map((item) => (
              <article key={item.id} className={styles.newsItem}>
                <div
                  className={styles.newsMedia}
                  style={
                    item.coverImageUrl
                      ? { backgroundImage: `url(${normalizeNewsImageUrl(item.coverImageUrl)})` }
                      : undefined
                  }
                >
                  {!item.coverImageUrl && <span>Sin imagen</span>}
                </div>
                <div className={styles.newsBody}>
                  <div className={styles.newsMeta}>
                    <span className={`${styles.statusBadge} ${styles[`status${item.status}`]}`}>
                      {item.status === "PUBLISHED"
                        ? "Publicado"
                        : item.status === "DRAFT"
                          ? "Borrador"
                          : "Archivado"}
                    </span>
                    <span className={styles.newsDate}>{formatDate(item.publishedAt || item.createdAt)}</span>
                  </div>
                  <h3 className={styles.newsTitle}>{item.title}</h3>
                  <p className={styles.newsSummary}>{item.summary || "Sin resumen"}</p>
                  <div className={styles.newsMetaRow}>
                    <span>{item.galleryUrls.length} imagenes</span>
                    <span>{item.tags.length ? item.tags.join(" · ") : "Sin tags"}</span>
                  </div>
                  <div className={styles.newsSlug}>/{item.slug}</div>
                  <div className={styles.newsActions}>
                    <button
                      type="button"
                      className={styles.ghostButton}
                      onClick={() => handleStartEditNews(item)}
                      disabled={savingNews || deletingNewsId === item.id}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className={styles.dangerButton}
                      onClick={() => handleDeleteNews(item)}
                      disabled={deletingNewsId === item.id}
                    >
                      {deletingNewsId === item.id ? "Eliminando..." : "Eliminar"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
            {!news.length && !newsLoading && (
              <div className={styles.emptyState}>No hay noticias registradas.</div>
            )}
          </div>
        </section>
      </div>

      <section className={styles.cardWide}>
        <header className={styles.cardHeader}>
          <div>
            <h2 className={styles.cardTitle}>Suscriptores de newsletter</h2>
            <p className={styles.cardSubtitle}>
              Revisa quienes llegan desde el footer y los formularios de contacto.
            </p>
          </div>
          <div className={styles.toolbar}>
            <input
              value={subscriberSearch}
              onChange={(event) => setSubscriberSearch(event.target.value)}
              placeholder="Buscar por correo o nombre..."
            />
            <button
              type="button"
              className={styles.refreshButton}
              onClick={fetchSubscribers}
              disabled={loading}
            >
              {loading ? "Actualizando..." : "Actualizar"}
            </button>
          </div>
        </header>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Correo</th>
                <th>Nombre</th>
                <th>Origen</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {subscribers.map((item) => (
                <tr key={item.id}>
                  <td>{item.email}</td>
                  <td>{item.name || "-"}</td>
                  <td>{item.source || "-"}</td>
                  <td>{new Date(item.subscribedAt).toLocaleString()}</td>
                </tr>
              ))}
              {!subscribers.length && !loading && (
                <tr>
                  <td colSpan={4} className={styles.emptyState}>
                    No hay suscriptores aun.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
