"use client";

import { useState, useEffect } from "react";
import { ErrorAlert } from '../../../lib/errors/ErrorAlert';
import { parseApiError } from '../../../lib/errors/api-error';
import Image from "next/image";
import ClientModal from "./ClientModal";
import styles from "./section.module.css";

interface Client {
  id: number;
  name: string;
  description?: string;
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

// Función para normalizar URLs de imágenes
// Convierte filenames y rutas relativas a URLs completas del API
const normalizeImageUrl = (imageUrl?: string): string | undefined => {
  if (!imageUrl || imageUrl.trim() === "") return undefined;
  
  // Si ya es una URL absoluta (http o https), devolverla tal cual
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    return imageUrl;
  }
  
  // Si es una ruta relativa del API (/clients/image/...) o un filename simple
  // Anteponer el API_URL
  if (imageUrl.startsWith("/")) {
    return `${API_URL}${imageUrl}`;
  }
  
  return `${API_URL}/clients/image/${imageUrl}`;
};

export default function Clientes() {
  const [clients, setClients] = useState<Client[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<any | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Cargar clientes al montar
  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_URL}/clients`);
      if (!response.ok) throw new Error("Error al cargar clientes");
      const data = await response.json();
      setClients(data);
      setError(null);
    } catch (err) {
      setError(parseApiError(err));
      // Usar datos de ejemplo si falla la API
      setClients([
        { id: 1, name: "Cliente Alfa", description: "Optimización de infraestructura y soporte 24/7.", imageUrl: "/marcas/marcas-01.png", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        { id: 2, name: "Cliente Beta", description: "Modernización de equipos y continuidad operativa.", imageUrl: "/marcas/marcas-05.png", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        { id: 3, name: "Cliente Gamma", description: "Integración de redes y seguridad perimetral.", imageUrl: "/marcas/marcas-10.png", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenModal = (client?: Client) => {
    setSelectedClient(client);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedClient(undefined);
  };

  const handleSaveClient = async (formData: FormData) => {
    try {
      setIsLoading(true);
      
      if (selectedClient) {
        // Actualizar cliente
        const response = await fetch(`${API_URL}/clients/${selectedClient.id}`, {
          method: "PUT",
          body: formData,
        });
        if (!response.ok) throw new Error("Error al actualizar cliente");
        const updatedClient = await response.json();
        setClients(clients.map(c => c.id === updatedClient.id ? updatedClient : c));
      } else {
        // Crear nuevo cliente
        const response = await fetch(`${API_URL}/clients`, {
          method: "POST",
          body: formData,
        });
        if (!response.ok) throw new Error("Error al crear cliente");
        const newClient = await response.json();
        setClients([...clients, newClient]);
      }
      
      handleCloseModal();
      setError(null);
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteClient = async (id: number) => {
    if (!confirm("¿Estás seguro de que deseas eliminar este cliente?")) return;

    try {
      setIsLoading(true);
      const response = await fetch(`${API_URL}/clients/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Error al eliminar cliente");
      setClients(clients.filter(c => c.id !== id));
      setError(null);
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const filteredClients = clients.filter(client =>
    client.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>👥 Clientes</h2>
          {error && <ErrorAlert error={typeof error === 'string' ? { statusCode: 0, errorCode: 'UNKNOWN', message: error } : error} />}
        </div>
        <button 
          className={styles.btnPrimary}
          onClick={() => handleOpenModal()}
          disabled={isLoading}
        >
          👤 Nuevo Cliente
        </button>
      </div>

      {/* Search Bar */}
      <div className={styles.searchBar}>
        <input
          type="text"
          placeholder="Buscar por nombre..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={styles.searchInput}
        />
      </div>

      {/* Clients Grid - Vista de tarjetas */}
      <div className={styles.clientsGrid}>
        {filteredClients.map((client) => {
          const normalizedImageUrl = normalizeImageUrl(client.imageUrl);
          return (
          <div key={client.id} className={styles.clientCard}>
            {normalizedImageUrl && (
              <div className={styles.clientImageWrapper}>
                <Image 
                  src={normalizedImageUrl} 
                  alt={client.name} 
                  className={styles.clientImage}
                  width={600}
                  height={600}
                  quality={95}
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  style={{ objectFit: 'cover', objectPosition: 'center' }}
                  unoptimized
                  priority={false}
                />
              </div>
            )}
            <div className={styles.clientInfo}>
              <h3 className={styles.clientName}>{client.name}</h3>
              {client.description && <p className={styles.clientDescription}>{client.description}</p>}
            </div>
            <div className={styles.clientActions}>
              <button 
                className={styles.btnSmall} 
                onClick={() => handleOpenModal(client)}
                disabled={isLoading}
                title="Editar"
              >
                ✎
              </button>
              <button 
                className={styles.btnSmall} 
                onClick={() => handleDeleteClient(client.id)}
                disabled={isLoading}
                title="Eliminar"
              >
                🗑️
              </button>
            </div>
          </div>
        );
        })}
      </div>

      {filteredClients.length === 0 && (
        <div className={styles.emptyState}>
          <p>No hay clientes disponibles</p>
        </div>
      )}

      {/* Modal */}
      <ClientModal
        isOpen={isModalOpen}
        client={selectedClient}
        onClose={handleCloseModal}
        onSave={handleSaveClient}
        isLoading={isLoading}
      />
    </div>
  );
}
