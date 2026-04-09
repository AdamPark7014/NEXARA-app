"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import styles from "./page.module.css";
import { openExternalUrl } from "@/lib/open-external-url";

type ContactMessage = {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  company?: string | null;
  subject?: string | null;
  category?: "SOPORTE" | "VENTAS" | string;
  message: string;
  newsletter: boolean;
  source?: string | null;
  pageUrl?: string | null;
  status: "NEW" | "IN_PROGRESS" | "RESPONDED" | "CLOSED" | string;
  responseMessage?: string | null;
  respondedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(
  /[\/.]+$/,
  ""
);
const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, "")}`;
const getSocketBaseUrl = () => API_URL.replace(/\/+api\/?$/, "");

const statusOptions = [
  { value: "NEW", label: "Nuevo" },
  { value: "IN_PROGRESS", label: "En progreso" },
  { value: "RESPONDED", label: "Respondido" },
  { value: "CLOSED", label: "Cerrado" },
];

export default function ContactosWeb() {
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [filterCategory, setFilterCategory] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [responseText, setResponseText] = useState("");
  const [status, setStatus] = useState<string>("NEW");
  const [sendChannel, setSendChannel] = useState<"EMAIL" | "WHATSAPP">("EMAIL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedIdRef = useRef<number | null>(null);

  const selectedMessage = useMemo(
    () => messages.find((item) => item.id === selectedId) || null,
    [messages, selectedId]
  );

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const fetchMessages = async () => {
    try {
      const params = new URLSearchParams();
      if (filterStatus !== "ALL") params.set("status", filterStatus);
      if (filterCategory !== "ALL") params.set("category", filterCategory);
      const query = params.toString() ? `?${params.toString()}` : "";
      const response = await fetch(buildApiUrl(`contact-messages${query}`), {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("No se pudieron cargar los contactos");
      }
      const data = (await response.json()) as ContactMessage[];
      setMessages(data);

      if (selectedIdRef.current) {
        const updated = data.find((item) => item.id === selectedIdRef.current);
        if (updated) {
          setResponseText(updated.responseMessage || "");
          setStatus(updated.status || "NEW");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  };

  useEffect(() => {
    fetchMessages();
  }, [filterStatus, filterCategory]);

  useEffect(() => {
    const socket = io(getSocketBaseUrl(), {
      transports: ["polling", "websocket"],
    });
    socket.on("contacts:changed", () => {
      fetchMessages();
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (selectedMessage) {
      setResponseText(selectedMessage.responseMessage || "");
      setStatus(selectedMessage.status || "NEW");
    }
  }, [selectedMessage]);

  const filteredMessages = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return messages;
    return messages.filter((item) => {
      return (
        item.name.toLowerCase().includes(term) ||
        item.email.toLowerCase().includes(term) ||
        (item.company || "").toLowerCase().includes(term) ||
        (item.subject || "").toLowerCase().includes(term)
      );
    });
  }, [messages, search]);

  const handleSelect = (message: ContactMessage) => {
    setSelectedId(message.id);
    setError(null);
  };

  const handleSave = async (options?: { sendResponse?: boolean }) => {
    if (!selectedMessage) return;
    const sendResponse = options?.sendResponse === true;
    const trimmedResponse = responseText.trim();

    if (sendResponse && !trimmedResponse) {
      setError("Escribe una respuesta antes de enviar.");
      return;
    }

    if (sendResponse && sendChannel === "WHATSAPP") {
      const phoneDigits = (selectedMessage.phone || "").replace(/\D/g, "");
      if (!phoneDigits) {
        setError("Este contacto no tiene teléfono para WhatsApp.");
        return;
      }
    }

    const nextStatus = sendResponse ? "RESPONDED" : status;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(buildApiUrl(`contact-messages/${selectedMessage.id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: nextStatus,
          responseMessage: responseText,
          sendChannel,
          sendResponse,
        }),
      });
      if (!response.ok) {
        throw new Error("No se pudo guardar la respuesta");
      }
      if (sendResponse && sendChannel === "WHATSAPP") {
        const phoneDigits = (selectedMessage.phone || "").replace(/\D/g, "");
        const url = `https://wa.me/${phoneDigits}?text=${encodeURIComponent(trimmedResponse)}`;
        void openExternalUrl(url);
      }
      fetchMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedMessage) return;
    const confirmed = window.confirm("Eliminar este contacto?");
    if (!confirmed) return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(buildApiUrl(`contact-messages/${selectedMessage.id}`), {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("No se pudo eliminar el contacto");
      }
      setSelectedId(null);
      fetchMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  const counts = useMemo(() => {
    return {
      total: messages.length,
      new: messages.filter((item) => item.status === "NEW").length,
      progress: messages.filter((item) => item.status === "IN_PROGRESS").length,
      responded: messages.filter((item) => item.status === "RESPONDED").length,
    };
  }, [messages]);

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Panel Web</p>
          <h1 className={styles.title}>Gestión inteligente de contactos</h1>
          <p className={styles.subtitle}>
            Centraliza contactos de /contacto y el formulario flotante. Responde y da seguimiento desde aquí.
          </p>
        </div>
        <div className={styles.headerStats}>
          <div>
            <span>{counts.total}</span>
            <small>Total</small>
          </div>
          <div>
            <span>{counts.new}</span>
            <small>Nuevos</small>
          </div>
          <div>
            <span>{counts.progress}</span>
            <small>En progreso</small>
          </div>
          <div>
            <span>{counts.responded}</span>
            <small>Respondidos</small>
          </div>
        </div>
      </header>

      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nombre, email, empresa o asunto..."
          />
        </div>
        <div className={styles.filters}>
          <select value={filterCategory} onChange={(event) => setFilterCategory(event.target.value)}>
            <option value="ALL">Todas las categorías</option>
            <option value="SOPORTE">Soporte y ayuda</option>
            <option value="VENTAS">Ventas y productos</option>
          </select>
          <select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)}>
            <option value="ALL">Todos los estados</option>
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.grid}>
        <aside className={styles.list}>
          {filteredMessages.map((message) => (
            <button
              key={message.id}
              type="button"
              className={`${styles.listCard} ${selectedId === message.id ? styles.activeCard : ""}`}
              onClick={() => handleSelect(message)}
            >
              <div className={styles.cardTop}>
                <div>
                  <h3>{message.name}</h3>
                  <p className={styles.cardEmail}>{message.email}</p>
                </div>
                <span className={`${styles.badge} ${styles[`badge${message.status}`]}`}>
                  {message.status}
                </span>
              </div>
              <p className={styles.cardSubject}>{message.subject || "Sin asunto"}</p>
              <p className={styles.cardMessage}>{message.message}</p>
              <div className={styles.cardMeta}>
                <span>{new Date(message.createdAt).toLocaleString()}</span>
                <span>{message.category === "VENTAS" ? "Ventas" : "Soporte"}</span>
                <span>{message.source || "formulario"}</span>
              </div>
            </button>
          ))}
          {!filteredMessages.length && (
            <div className={styles.emptyState}>No hay contactos con esos filtros.</div>
          )}
        </aside>

        <section className={styles.detail}>
          {selectedMessage ? (
            <>
              <div className={styles.detailHeader}>
                <div className={styles.contactInfo}>
                  <h2>{selectedMessage.name}</h2>
                  <p>{selectedMessage.email}</p>
                  {selectedMessage.phone && <p>{selectedMessage.phone}</p>}
                  {selectedMessage.company && <p>{selectedMessage.company}</p>}
                </div>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() =>
                      void openExternalUrl(
                        `mailto:${selectedMessage.email}?subject=${encodeURIComponent(selectedMessage.subject || "Contacto Nexara")}`
                      )
                    }
                  >
                    Abrir correo
                  </button>
                  <button
                    type="button"
                    className={styles.ghostButton}
                    onClick={handleDelete}
                  >
                    Eliminar
                  </button>
                </div>
              </div>

              <div className={styles.detailBody}>
                <div className={styles.messageBlock}>
                  <h3>Mensaje</h3>
                  <p>{selectedMessage.message}</p>
                </div>
                <div className={styles.metaGrid}>
                  <div>
                    <span>Categoría</span>
                    <strong>{selectedMessage.category === "VENTAS" ? "Ventas y productos" : "Soporte y ayuda"}</strong>
                  </div>
                  <div>
                    <span>Asunto</span>
                    <strong>{selectedMessage.subject || "Sin asunto"}</strong>
                  </div>
                  <div>
                    <span>Origen</span>
                    <strong>{selectedMessage.source || "formulario"}</strong>
                  </div>
                  <div>
                    <span>Newsletter</span>
                    <strong>{selectedMessage.newsletter ? "Si" : "No"}</strong>
                  </div>
                  <div>
                    <span>Recibido</span>
                    <strong>{new Date(selectedMessage.createdAt).toLocaleString()}</strong>
                  </div>
                </div>
                <div className={styles.replyBlock}>
                  <div className={styles.replyHeader}>
                    <h3>Respuesta</h3>
                    <div className={styles.replyControls}>
                      <select value={status} onChange={(event) => setStatus(event.target.value)}>
                        {statusOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <select
                        value={sendChannel}
                        onChange={(event) =>
                          setSendChannel(event.target.value as "EMAIL" | "WHATSAPP")
                        }
                      >
                        <option value="EMAIL">Enviar por correo</option>
                        <option value="WHATSAPP">Enviar por WhatsApp</option>
                      </select>
                    </div>
                  </div>
                  <textarea
                    value={responseText}
                    onChange={(event) => setResponseText(event.target.value)}
                    placeholder="Escribe aquí la respuesta o notas internas..."
                    rows={6}
                  />
                  {error && <p className={styles.error}>{error}</p>}
                  <div className={styles.replyActions}>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => handleSave()}
                      disabled={loading}
                    >
                      {loading ? "Guardando..." : "Guardar"}
                    </button>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={() => handleSave({ sendResponse: true })}
                      disabled={loading}
                    >
                      {loading
                        ? "Enviando..."
                        : sendChannel === "WHATSAPP"
                          ? "Enviar por WhatsApp"
                          : "Enviar por correo"}
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className={styles.emptyDetail}>
              Selecciona un contacto para ver el detalle y responder.
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
