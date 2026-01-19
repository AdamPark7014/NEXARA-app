"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import styles from "./ClientModal.module.css";

interface Client {
  id: number;
  name: string;
  description?: string;
  imageUrl?: string;
}

interface ClientModalProps {
  isOpen: boolean;
  client?: Client;
  onClose: () => void;
  onSave: (formData: FormData) => Promise<void>;
  isLoading: boolean;
}

const API_URL = typeof window !== "undefined" ? (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001") : "http://localhost:3001";

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

export default function ClientModal({ isOpen, client, onClose, onSave, isLoading }: ClientModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Validar que imageUrl no sea una cadena vacía o con solo espacios
  const getValidImageUrl = (url?: string) => {
    const normalized = normalizeImageUrl(url);
    return normalized || null;
  };
  const [preview, setPreview] = useState<string | null>(getValidImageUrl(client?.imageUrl));
  const [isDragging, setIsDragging] = useState(false);
  const [errors, setErrors] = useState({ name: "", description: "" });
  const [formData, setFormData] = useState({
    name: client?.name || "",
    description: client?.description || "",
  });

  useEffect(() => {
    if (client) {
      setFormData({
        name: client.name || "",
        description: client.description || "",
      });
      setPreview(getValidImageUrl(client.imageUrl));
    }
  }, [client]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
    
    // Limpiar error cuando el usuario empieza a escribir
    if (errors[name as keyof typeof errors]) {
      setErrors({ ...errors, [name]: "" });
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    processImageFile(file);
  };

  const processImageFile = (file?: File) => {
    if (file) {
      // Validar tamaño (5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert("La imagen no debe superar 5MB");
        return;
      }

      // Validar tipo
      if (!file.type.startsWith("image/")) {
        alert("Solo se permiten archivos de imagen");
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    processImageFile(file);
    
    // Actualizar el input file
    if (fileInputRef.current && file) {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInputRef.current.files = dataTransfer.files;
    }
  };

  const handleRemoveImage = () => {
    setPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const validateForm = () => {
    const newErrors = { name: "", description: "" };
    let isValid = true;

    if (!formData.name.trim()) {
      newErrors.name = "El nombre es obligatorio";
      isValid = false;
    } else if (formData.name.length < 3) {
      newErrors.name = "El nombre debe tener al menos 3 caracteres";
      isValid = false;
    }

    if (formData.description && formData.description.length > 500) {
      newErrors.description = "La descripción no debe superar 500 caracteres";
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    const form = new FormData();
    form.append("name", formData.name.trim());
    form.append("description", formData.description.trim());
    
    if (fileInputRef.current?.files?.[0]) {
      form.append("image", fileInputRef.current.files[0]);
    }

    await onSave(form);
    
    // Resetear formulario
    setFormData({ name: "", description: "" });
    setPreview(null);
    setErrors({ name: "", description: "" });
  };

  const handleClose = () => {
    setFormData({ name: "", description: "" });
    setPreview(null);
    setErrors({ name: "", description: "" });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitleWrapper}>
            <div className={styles.modalIcon}>
              {client ? "✏️" : "👤"}
            </div>
            <div>
              <h3 className={styles.modalTitle}>
                {client ? "Editar Cliente" : "Nuevo Cliente"}
              </h3>
              <p className={styles.modalSubtitle}>
                {client ? "Actualiza la información del cliente" : "Completa los datos del cliente"}
              </p>
            </div>
          </div>
          <button 
            className={styles.closeBtn} 
            onClick={handleClose}
            type="button"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {/* Image Upload Section */}
          <div className={styles.imageSection}>
            <label className={styles.sectionLabel}>
              <span className={styles.labelIcon}>📸</span>
              Logo o Imagen del Cliente
            </label>
            <div 
              className={`${styles.dropZone} ${isDragging ? styles.dragging : ""} ${preview ? styles.hasPreview : ""}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {preview ? (
                <div className={styles.previewContainer}>
                  <Image 
                    src={preview} 
                    alt="Preview" 
                    className={styles.previewImage}
                    width={400}
                    height={400}
                    quality={95}
                    style={{ objectFit: 'cover' }}
                    unoptimized
                  />
                  <button
                    type="button"
                    className={styles.removeImageBtn}
                    onClick={handleRemoveImage}
                  >
                    🗑️ Eliminar
                  </button>
                </div>
              ) : (
                <div className={styles.dropZoneContent}>
                  <div className={styles.uploadIcon}>📁</div>
                  <p className={styles.dropZoneText}>
                    <strong>Arrastra una imagen</strong> o haz clic para seleccionar
                  </p>
                  <p className={styles.dropZoneHint}>
                    PNG, JPG, WEBP hasta 5MB
                  </p>
                </div>
              )}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageChange}
                accept="image/*"
                className={styles.fileInput}
                id="image-upload"
              />
            </div>
          </div>

          {/* Form Fields */}
          <div className={styles.formFields}>
            {/* Name Field */}
            <div className={styles.formGroup}>
              <label htmlFor="name" className={styles.label}>
                <span className={styles.labelIcon}>🏢</span>
                Nombre del Cliente
                <span className={styles.required}>*</span>
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="Ej: Empresa ABC, Cliente Alfa..."
                className={`${styles.input} ${errors.name ? styles.inputError : ""}`}
                disabled={isLoading}
              />
              {errors.name && <span className={styles.errorMessage}>{errors.name}</span>}
              <div className={styles.charCount}>
                {formData.name.length} / 255 caracteres
              </div>
            </div>

            {/* Description Field */}
            <div className={styles.formGroup}>
              <label htmlFor="description" className={styles.label}>
                <span className={styles.labelIcon}>📝</span>
                Descripción
              </label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                placeholder="Describe los servicios o productos que ofreces a este cliente..."
                className={`${styles.textarea} ${errors.description ? styles.inputError : ""}`}
                rows={4}
                disabled={isLoading}
              />
              {errors.description && <span className={styles.errorMessage}>{errors.description}</span>}
              <div className={styles.charCount}>
                {formData.description.length} / 500 caracteres
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className={styles.formActions}>
            <button
              type="button"
              onClick={handleClose}
              className={styles.btnSecondary}
              disabled={isLoading}
            >
              <span>❌</span>
              Cancelar
            </button>
            <button
              type="submit"
              className={styles.btnPrimary}
              disabled={isLoading || !formData.name.trim()}
            >
              {isLoading ? (
                <>
                  <span className={styles.spinner}>⏳</span>
                  Guardando...
                </>
              ) : (
                <>
                  <span>{client ? "💾" : "✅"}</span>
                  {client ? "Actualizar Cliente" : "Crear Cliente"}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
