"use client";

import { buildApiUrl, getApiAssetOrigin } from "@/lib/api-base";
import React, { useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";

type Client = {
  id: number;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  createdAt: string;
  updatedAt: string;
};

type ClientForm = {
  name: string;
  description: string;
};

const emptyForm: ClientForm = {
  name: "",
  description: "",
};

const normalizeClientImageUrl = (imageUrl?: string | null) => {
  if (!imageUrl) return undefined;
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    return imageUrl;
  }
  const assetOrigin = getApiAssetOrigin();
  if (imageUrl.startsWith("/")) {
    return `${assetOrigin}${imageUrl}`;
  }
  return `${assetOrigin}/clients/image/${imageUrl}`;
};

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleString() : "Sin fecha";

export default function ClientesWeb() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState<ClientForm>(emptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [removeImage, setRemoveImage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === selectedId) || null,
    [clients, selectedId]
  );

  const fetchClients = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(buildApiUrl("clients"), { cache: "no-store" });
      if (!response.ok) {
        throw new Error("No se pudieron cargar los clientes");
      }
      const data = (await response.json()) as Client[];
      setClients(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  useEffect(() => {
    if (!imageFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [imageFile]);

  useEffect(() => {
    if (!selectedClient) return;
    setForm({
      name: selectedClient.name,
      description: selectedClient.description || "",
    });
    setImageFile(null);
    setRemoveImage(false);
    setStatus(null);
    setError(null);
  }, [selectedClient]);

  const handleSelect = (client: Client) => {
    setSelectedId(client.id);
  };

  const handleNew = () => {
    setSelectedId(null);
    setForm(emptyForm);
    setImageFile(null);
    setRemoveImage(false);
    setStatus(null);
    setError(null);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      setImageFile(file);
      setRemoveImage(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setImageFile(file);
      setRemoveImage(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setStatus(null);

    try {
      const trimmedName = form.name.trim();
      if (!trimmedName) {
        throw new Error("El nombre del cliente es obligatorio");
      }

      const formData = new FormData();
      formData.append("name", trimmedName);
      if (form.description.trim()) {
        formData.append("description", form.description.trim());
      }
      if (imageFile) {
        formData.append("image", imageFile);
      }
      if (removeImage) {
        formData.append("removeImage", "true");
      }

      const endpoint = selectedId ? `clients/${selectedId}` : "clients";
      const response = await fetch(buildApiUrl(endpoint), {
        method: selectedId ? "PUT" : "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("No se pudo guardar el cliente");
      }

      const saved = (await response.json()) as Client;
      setStatus(selectedId ? "Cliente actualizado" : "Cliente creado");
      setImageFile(null);
      setRemoveImage(false);
      await fetchClients();
      setSelectedId(saved.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch(buildApiUrl(`clients/${selectedId}`), {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("No se pudo eliminar el cliente");
      }
      setStatus("Cliente eliminado");
      handleNew();
      await fetchClients();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  };

  const currentImageUrl = selectedClient?.imageUrl
    ? normalizeClientImageUrl(selectedClient.imageUrl)
    : null;

  const showingPreviewUrl = previewUrl || currentImageUrl;

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Panel web</p>
          <h1 className={styles.title}>Clientes y testimonios</h1>
          <p className={styles.subtitle}>
            Gestiona el portafolio de clientes con su imagen, descripción y contexto del trabajo.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.secondaryButton} type="button" onClick={handleNew}>
            Nuevo cliente
          </button>
        </div>
      </header>

      <div className={styles.contentGrid}>
        <form className={styles.formCard} onSubmit={handleSubmit}>
          <div className={styles.formHeader}>
            <div>
              <h2 className={styles.cardTitle}>
                {selectedClient ? "Editar cliente" : "Crear nuevo cliente"}
              </h2>
              <p className={styles.cardSubtitle}>
                {selectedClient
                  ? `Última actualización: ${formatDate(selectedClient.updatedAt)}`
                  : "Completa los datos para publicar un cliente."}
              </p>
            </div>
            <span className={styles.badge}>{clients.length} clientes</span>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="client-name">
              Nombre del cliente
            </label>
            <input
              id="client-name"
              className={styles.input}
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Ej. Construcciones Rivera"
              required
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="client-description">
              Descripcion / trabajo realizado
            </label>
            <textarea
              id="client-description"
              className={styles.textarea}
              value={form.description}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, description: event.target.value }))
              }
              placeholder="Resumen del proyecto, alcance y resultado logrado."
              rows={4}
            />
          </div>

          <div className={styles.field}>
            <span className={styles.label}>Imagen del cliente</span>
            <div
              className={`${styles.dropzone} ${dragActive ? styles.dropzoneActive : ""}`}
              onDragEnter={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setDragActive(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setDragActive(false);
              }}
              onDrop={handleDrop}
            >
              <input
                className={styles.fileInput}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
              />
              <div>
                <p className={styles.dropTitle}>
                  Arrastra y suelta la imagen aquí o selecciona un archivo
                </p>
                <p className={styles.dropHint}>PNG, JPG o WEBP. Recomendado 1200px.</p>
              </div>
            </div>
            {showingPreviewUrl && (
              <div className={styles.preview}>
                <img
                  className={styles.previewImage}
                  src={showingPreviewUrl}
                  alt={selectedClient?.name || "Vista previa"}
                />
                <div className={styles.previewDetails}>
                  <p className={styles.previewTitle}>Vista previa</p>
                  {imageFile ? (
                    <p className={styles.previewMeta}>{imageFile.name}</p>
                  ) : (
                    <p className={styles.previewMeta}>Imagen actual almacenada</p>
                  )}
                </div>
              </div>
            )}
            {selectedClient?.imageUrl && !imageFile && (
              <label className={styles.removeToggle}>
                <input
                  type="checkbox"
                  checked={removeImage}
                  onChange={(event) => setRemoveImage(event.target.checked)}
                />
                Eliminar imagen actual al guardar
              </label>
            )}
          </div>

          {error && <p className={styles.error}>{error}</p>}
          {status && <p className={styles.success}>{status}</p>}

          <div className={styles.actions}>
            <button className={styles.primaryButton} type="submit" disabled={saving}>
              {saving ? "Guardando..." : selectedClient ? "Actualizar cliente" : "Crear cliente"}
            </button>
            {selectedClient && (
              <button
                className={styles.dangerButton}
                type="button"
                onClick={handleDelete}
                disabled={saving}
              >
                Eliminar
              </button>
            )}
          </div>
        </form>

        <aside className={styles.listCard}>
          <div className={styles.listHeader}>
            <div>
              <h2 className={styles.cardTitle}>Clientes publicados</h2>
              <p className={styles.cardSubtitle}>Selecciona un cliente para editarlo.</p>
            </div>
            <span className={styles.badge}>{clients.length} activos</span>
          </div>

          {loading ? (
            <p className={styles.loading}>Cargando clientes...</p>
          ) : clients.length === 0 ? (
            <p className={styles.emptyState}>Aun no hay clientes registrados.</p>
          ) : (
            <div className={styles.list}>
              {clients.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  className={`${styles.listItem} ${
                    selectedId === client.id ? styles.listItemActive : ""
                  }`}
                  onClick={() => handleSelect(client)}
                >
                  <div>
                    <p className={styles.listTitle}>{client.name}</p>
                    <p className={styles.listDesc}>
                      {client.description || "Sin descripción"}
                    </p>
                  </div>
                  <span className={styles.listMeta}>{formatDate(client.createdAt)}</span>
                </button>
              ))}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
