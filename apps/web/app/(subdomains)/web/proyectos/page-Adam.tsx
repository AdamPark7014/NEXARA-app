"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import styles from "./page.module.css";
import { buildApiUrl, getApiBase, getSocketBaseUrl } from "@/lib/api-base";

type Project = {
  id: number;
  slug: string;
  title: string;
  sector: string;
  summary: string;
  impact: string;
  services: string[];
  tags: string[];
  highlights: string[];
  mainImage?: string | null;
  gallery: string[];
  showInCatalog: boolean;
  createdAt: string;
  updatedAt: string;
};

type ProjectForm = {
  slug: string;
  title: string;
  sector: string;
  summary: string;
  impact: string;
  services: string[];
  tags: string[];
  highlights: string[];
  showInCatalog: boolean;
  mainImage?: string | null;
  gallery: string[];
};

const API_URL = getApiBase();

const normalizeImageUrl = (imageUrl?: string | null) => {
  if (!imageUrl) return undefined;
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    return imageUrl;
  }
  if (imageUrl.startsWith("/")) {
    if (imageUrl.startsWith("/projects/image/")) {
      return `${API_URL}${imageUrl}`;
    }
    return imageUrl;
  }
  return `${API_URL}/projects/image/${imageUrl}`;
};

const emptyForm: ProjectForm = {
  slug: "",
  title: "",
  sector: "",
  summary: "",
  impact: "",
  services: [""],
  tags: [""],
  highlights: [""],
  showInCatalog: true,
  mainImage: null,
  gallery: [],
};

export default function ProyectosWeb() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState<ProjectForm>(emptyForm);
  const [mainImageFile, setMainImageFile] = useState<File | null>(null);
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [mainDragActive, setMainDragActive] = useState(false);
  const [galleryDragActive, setGalleryDragActive] = useState(false);
  const [mainPreviewUrl, setMainPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const selectedIdRef = useRef<number | null>(null);
  const mainInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const originalGalleryRef = useRef<string[]>([]);
  const originalMainImageRef = useRef<string | null>(null);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedId) || null,
    [projects, selectedId]
  );

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const fetchProjects = async () => {
    try {
      const response = await fetch(buildApiUrl("projects"), { cache: "no-store" });
      if (!response.ok) {
        throw new Error("No se pudieron cargar los proyectos");
      }
      const data = (await response.json()) as Project[];
      setProjects(data);

      if (selectedIdRef.current) {
        const updated = data.find((item) => item.id === selectedIdRef.current);
        if (updated) {
          setForm(toForm(updated));
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    const socket = io(getSocketBaseUrl(), {
      transports: ["polling", "websocket"],
    });
    socket.on("projects:changed", () => {
      fetchProjects();
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (selectedProject) {
      setForm(toForm(selectedProject));
      setMainImageFile(null);
      setGalleryFiles([]);
      originalGalleryRef.current = selectedProject.gallery || [];
      originalMainImageRef.current = selectedProject.mainImage || null;
    }
  }, [selectedProject]);

  useEffect(() => {
    if (!mainImageFile) {
      setMainPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(mainImageFile);
    setMainPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [mainImageFile]);

  const galleryPreviewUrls = useMemo(
    () => galleryFiles.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [galleryFiles]
  );

  useEffect(() => {
    return () => {
      galleryPreviewUrls.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, [galleryPreviewUrls]);

  const toForm = (project: Project): ProjectForm => ({
    slug: project.slug,
    title: project.title,
    sector: project.sector,
    summary: project.summary,
    impact: project.impact,
    services: project.services.length ? project.services : [""],
    tags: project.tags.length ? project.tags : [""],
    highlights: project.highlights.length ? project.highlights : [""],
    showInCatalog: project.showInCatalog ?? true,
    mainImage: project.mainImage || null,
    gallery: project.gallery || [],
  });

  const handleSelect = (project: Project) => {
    setSelectedId(project.id);
    setStatus(null);
    setError(null);
  };

  const handleNew = () => {
    setSelectedId(null);
    setForm(emptyForm);
    setMainImageFile(null);
    setGalleryFiles([]);
    setStatus(null);
    setError(null);
  };

  const updateField = (field: keyof ProjectForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateListItem = (field: "services" | "tags" | "highlights", index: number, value: string) => {
    setForm((prev) => {
      const next = [...prev[field]];
      next[index] = value;
      return { ...prev, [field]: next };
    });
  };

  const addListItem = (field: "services" | "tags" | "highlights") => {
    setForm((prev) => ({ ...prev, [field]: [...prev[field], ""] }));
  };

  const removeListItem = (field: "services" | "tags" | "highlights", index: number) => {
    setForm((prev) => {
      const next = prev[field].filter((_, idx) => idx !== index);
      return { ...prev, [field]: next.length ? next : [""] };
    });
  };

  const sanitizeList = (values: string[]) =>
    values.map((value) => value.trim()).filter((value) => value.length > 0);

  const getImageFiles = (files: FileList | null) =>
    Array.from(files || []).filter((file) => file.type.startsWith("image/"));

  const handleMainFile = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Solo se permiten imagenes para la foto principal.");
      return;
    }
    setError(null);
    setMainImageFile(file);
  };

  const handleGalleryFiles = (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (!imageFiles.length) return;
    const availableSlots = Math.max(0, 8 - form.gallery.length);
    if (availableSlots === 0) {
      setError("La galeria ya tiene 8 imagenes. Elimina una para reemplazar.");
      return;
    }

    setGalleryFiles((prev) => {
      const merged = [...prev, ...imageFiles];
      if (merged.length > availableSlots) {
        setError("La galeria permite hasta 8 imagenes.");
      } else {
        setError(null);
      }
      return merged.slice(0, availableSlots);
    });
  };

  const removeExistingMainImage = () => {
    setForm((prev) => ({ ...prev, mainImage: null }));
  };

  const removeExistingGalleryImage = (index: number) => {
    setForm((prev) => ({
      ...prev,
      gallery: prev.gallery.filter((_, idx) => idx !== index),
    }));
  };

  const removeGalleryFile = (index: number) => {
    setGalleryFiles((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleMainDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setMainDragActive(false);
    const file = event.dataTransfer.files?.[0] || null;
    handleMainFile(file);
  };

  const handleGalleryDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setGalleryDragActive(false);
    handleGalleryFiles(getImageFiles(event.dataTransfer.files));
  };

  const validateForm = () => {
    const totalGalleryCount = form.gallery.length + galleryFiles.length;
    if (!form.title.trim() || !form.sector.trim() || !form.summary.trim() || !form.impact.trim()) {
      setError("Completa titulo, sector, resumen e impacto.");
      return false;
    }
    if (!sanitizeList(form.services).length || !sanitizeList(form.tags).length || !sanitizeList(form.highlights).length) {
      setError("Agrega al menos un servicio, tag y highlight.");
      return false;
    }
    if (!selectedId) {
      if (!mainImageFile) {
        setError("La imagen principal es requerida.");
        return false;
      }
      if (galleryFiles.length !== 8) {
        setError("La galeria debe tener exactamente 8 imagenes.");
        return false;
      }
    } else {
      if (!form.mainImage && !mainImageFile) {
        setError("Debes subir una nueva imagen principal.");
        return false;
      }
      if (totalGalleryCount !== 8) {
        setError("La galeria debe tener exactamente 8 imagenes.");
        return false;
      }
    }

    setError(null);
    return true;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus(null);

    if (!validateForm()) return;

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("title", form.title);
      formData.append("sector", form.sector);
      formData.append("summary", form.summary);
      formData.append("impact", form.impact);
      if (form.slug.trim()) {
        formData.append("slug", form.slug.trim());
      }

      formData.append("services", JSON.stringify(sanitizeList(form.services)));
      formData.append("tags", JSON.stringify(sanitizeList(form.tags)));
      formData.append("highlights", JSON.stringify(sanitizeList(form.highlights)));
      formData.append("showInCatalog", String(form.showInCatalog));

      if (mainImageFile) {
        formData.append("mainImage", mainImageFile);
      }
      if (galleryFiles.length) {
        galleryFiles.forEach((file) => formData.append("gallery", file));
      }
      if (selectedId) {
        formData.append("galleryKeep", JSON.stringify(form.gallery));
      }

      const url = selectedId
        ? buildApiUrl(`projects/${selectedId}`)
        : buildApiUrl("projects");
      const method = selectedId ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        let message = "Error al guardar el proyecto";
        try {
          const parsed = JSON.parse(errorText);
          message = parsed.message || message;
        } catch {
          message = errorText || message;
        }
        throw new Error(message);
      }

      const saved = (await response.json()) as Project;
      setStatus(selectedId ? "Proyecto actualizado." : "Proyecto creado.");
      setSelectedId(saved.id);
      setMainImageFile(null);
      setGalleryFiles([]);
      setForm(toForm(saved));
      fetchProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    const confirmed = window.confirm("Eliminar este proyecto?");
    if (!confirmed) return;

    setLoading(true);
    try {
      const response = await fetch(buildApiUrl(`projects/${selectedId}/delete`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      if (!response.ok) {
        const errorText = await response.text();
        let message = "No se pudo eliminar el proyecto";
        try {
          const parsed = JSON.parse(errorText);
          message = parsed.message || message;
        } catch {
          message = errorText || message;
        }
        throw new Error(message);
      }
      setStatus("Proyecto eliminado.");
      handleNew();
      fetchProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Panel Web</p>
          <h1 className={styles.title}>Gestion de Proyectos</h1>
          <p className={styles.subtitle}>Edita en tiempo real los proyectos visibles en /proyectos.</p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.secondaryButton} onClick={handleNew}>
            Nuevo proyecto
          </button>
          {selectedId && (
            <button type="button" className={styles.ghostButton} onClick={handleDelete}>
              Eliminar
            </button>
          )}
        </div>
      </header>

      <div className={styles.grid}>
        <aside className={styles.list}>
          <div className={styles.listHeader}>
            <h2>Proyectos actuales</h2>
            <span>{projects.length} items</span>
          </div>
          <div className={styles.listBody}>
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                className={`${styles.listCard} ${selectedId === project.id ? styles.activeCard : ""}`}
                onClick={() => handleSelect(project)}
              >
                <div>
                  <p className={styles.cardTag}>{project.sector}</p>
                  <h3>{project.title}</h3>
                  <p className={styles.cardSummary}>{project.summary}</p>
                </div>
                <span className={styles.cardArrow}>Editar</span>
              </button>
            ))}
            {!projects.length && (
              <div className={styles.emptyState}>Aun no hay proyectos. Crea el primero.</div>
            )}
          </div>
        </aside>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.formHeader}>
            <div>
              <h2>{selectedId ? "Editar proyecto" : "Nuevo proyecto"}</h2>
              <p>Completa todos los campos y sube las 8 miniaturas + la foto principal.</p>
            </div>
            {status && <span className={styles.success}>{status}</span>}
            {error && <span className={styles.error}>{error}</span>}
          </div>

          <div className={styles.fieldGrid}>
            <label className={styles.field}>
              Titulo
              <input
                value={form.title}
                onChange={(event) => updateField("title", event.target.value)}
                placeholder="Titulo del proyecto"
                required
              />
            </label>
            <label className={styles.field}>
              Sector
              <input
                value={form.sector}
                onChange={(event) => updateField("sector", event.target.value)}
                placeholder="Sector"
                required
              />
            </label>
            <label className={styles.field}>
              Slug
              <input
                value={form.slug}
                onChange={(event) => updateField("slug", event.target.value)}
                placeholder="slug-amigable"
              />
            </label>
            <label className={styles.field}>
              Impacto
              <input
                value={form.impact}
                onChange={(event) => updateField("impact", event.target.value)}
                placeholder="Ej: SLA 99.98%"
                required
              />
            </label>
            <label className={styles.toggleField}>
              <input
                type="checkbox"
                checked={form.showInCatalog}
                onChange={(event) => setForm((prev) => ({ ...prev, showInCatalog: event.target.checked }))}
              />
              <span>Mostrar proyecto en el catalogo</span>
            </label>
          </div>

          <label className={styles.field}>
            Resumen
            <textarea
              value={form.summary}
              onChange={(event) => updateField("summary", event.target.value)}
              placeholder="Resumen ejecutivo"
              rows={4}
              required
            />
          </label>

          <div className={styles.listGroup}>
            <div className={styles.listHeaderRow}>
              <h3>Servicios</h3>
              <button type="button" onClick={() => addListItem("services")}>
                + Agregar
              </button>
            </div>
            {form.services.map((item, index) => (
              <div className={styles.listRow} key={`service-${index}`}>
                <input
                  value={item}
                  onChange={(event) => updateListItem("services", index, event.target.value)}
                  placeholder="Servicio"
                />
                <button type="button" onClick={() => removeListItem("services", index)}>
                  Quitar
                </button>
              </div>
            ))}
          </div>

          <div className={styles.listGroup}>
            <div className={styles.listHeaderRow}>
              <h3>Tags</h3>
              <button type="button" onClick={() => addListItem("tags")}>
                + Agregar
              </button>
            </div>
            {form.tags.map((item, index) => (
              <div className={styles.listRow} key={`tag-${index}`}>
                <input
                  value={item}
                  onChange={(event) => updateListItem("tags", index, event.target.value)}
                  placeholder="Tag"
                />
                <button type="button" onClick={() => removeListItem("tags", index)}>
                  Quitar
                </button>
              </div>
            ))}
          </div>

          <div className={styles.listGroup}>
            <div className={styles.listHeaderRow}>
              <h3>Highlights</h3>
              <button type="button" onClick={() => addListItem("highlights")}>
                + Agregar
              </button>
            </div>
            {form.highlights.map((item, index) => (
              <div className={styles.listRow} key={`highlight-${index}`}>
                <input
                  value={item}
                  onChange={(event) => updateListItem("highlights", index, event.target.value)}
                  placeholder="Punto destacado"
                />
                <button type="button" onClick={() => removeListItem("highlights", index)}>
                  Quitar
                </button>
              </div>
            ))}
          </div>

          <div className={styles.mediaGroup}>
            <div className={styles.mediaBlock}>
              <h3>Foto principal</h3>
              {mainPreviewUrl ? (
                <div className={styles.imagePreview}>
                  <div className={styles.previewItem}>
                    <img src={mainPreviewUrl} alt="Principal" />
                    <button
                      type="button"
                      className={styles.removeButton}
                      onClick={() => setMainImageFile(null)}
                    >
                      x
                    </button>
                  </div>
                </div>
              ) : (
                form.mainImage && (
                  <div className={styles.imagePreview}>
                    <div className={styles.previewItem}>
                      <img src={normalizeImageUrl(form.mainImage)} alt="Principal" />
                      <button
                        type="button"
                        className={styles.removeButton}
                        onClick={removeExistingMainImage}
                      >
                        x
                      </button>
                    </div>
                  </div>
                )
              )}
              {mainImageFile && (
                <p className={styles.helper}>Seleccionada: {mainImageFile.name}</p>
              )}
              <div
                className={`${styles.dropZone} ${mainDragActive ? styles.dropZoneActive : ""}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setMainDragActive(true);
                }}
                onDragLeave={() => setMainDragActive(false)}
                onDrop={handleMainDrop}
                onClick={() => mainInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    mainInputRef.current?.click();
                  }
                }}
              >
                <p className={styles.dropHint}>Arrastra la imagen principal aqui o haz click</p>
              </div>
              <input
                ref={mainInputRef}
                className={styles.fileInput}
                type="file"
                accept="image/*"
                onChange={(event) => handleMainFile(event.target.files?.[0] || null)}
              />
              <p className={styles.helper}>Sube una imagen principal en alta.</p>
            </div>

            <div className={styles.mediaBlock}>
              <h3>Galeria (8 miniaturas)</h3>
              {(form.gallery.length > 0 || galleryPreviewUrls.length > 0) && (
                <div className={styles.galleryPreview}>
                  {form.gallery.map((item, index) => (
                    <div className={styles.galleryItem} key={`gallery-existing-${index}`}>
                      <div className={styles.previewItem}>
                        <img src={normalizeImageUrl(item)} alt={`Galeria ${index + 1}`} />
                        <button
                          type="button"
                          className={styles.removeButton}
                          onClick={() => removeExistingGalleryImage(index)}
                        >
                          x
                        </button>
                      </div>
                    </div>
                  ))}
                  {galleryPreviewUrls.map((item, index) => (
                    <div className={styles.galleryItem} key={`gallery-new-${index}`}>
                      <div className={styles.previewItem}>
                        <img src={item.url} alt={`Nueva galeria ${index + 1}`} />
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
                className={`${styles.dropZone} ${galleryDragActive ? styles.dropZoneActive : ""}`}
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
                <p className={styles.dropHint}>Arrastra 8 imagenes aqui o haz click</p>
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
                {form.gallery.length + galleryFiles.length > 0
                  ? `${form.gallery.length + galleryFiles.length}/8 imagenes seleccionadas`
                  : "Selecciona 8 imagenes para la galeria."}
              </p>
            </div>
          </div>

          <div className={styles.formFooter}>
            <button type="submit" className={styles.primaryButton} disabled={loading}>
              {loading ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
