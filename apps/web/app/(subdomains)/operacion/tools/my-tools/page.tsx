"use client";

import React, { useEffect, useRef, useState } from "react";
import styles from "../../../console/console.module.css";
import { useUser } from "@/components/UserContext";
import { hasAnyPermission, PERMISSIONS } from "@/lib/permissions";
import HelpTab from '@/components/HelpTab';

type BorrowTool = {
  id: number;
  toolName: string;
  startDate: string;
  expectedReturnDate: string;
  status: string;
};

export default function MyToolsPage() {
  const { user } = useUser();
  const [showRequest, setShowRequest] = useState(false);
  const [photoStep, setPhotoStep] = useState<"general" | "specifications" | null>(null);
  const [generalPhoto, setGeneralPhoto] = useState<string | null>(null);
  const [specificationsPhoto, setSpecificationsPhoto] = useState<string | null>(null);
  const [borrowTools, setBorrowTools] = useState<BorrowTool[]>([]);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    tool: "",
    model: "",
    serial: "",
    reason: "",
    startDate: new Date().toISOString().split("T")[0],
    expectedReturnDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (user) {
      loadBorrowTools();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (!user) return null;

  const canView = hasAnyPermission(user, [PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN]);
  if (!canView) return null;

  const startCamera = async (step: "general" | "specifications") => {
    setPhotoStep(step);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: 1920, height: 1080 },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (error) {
      console.error("Error al acceder a la cámara:", error);
      alert("No se pudo acceder a la cámara");
      setPhotoStep(null);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        const photoData = canvas.toDataURL("image/jpeg", 0.9);

        if (photoStep === "general") {
          setGeneralPhoto(photoData);
        } else if (photoStep === "specifications") {
          setSpecificationsPhoto(photoData);
        }

        stopCamera();
      }
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setPhotoStep(null);
  };

  const retakePhoto = (type: "general" | "specifications") => {
    if (type === "general") {
      setGeneralPhoto(null);
    } else {
      setSpecificationsPhoto(null);
    }
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!generalPhoto || !specificationsPhoto) {
      alert("Ambas fotos son obligatorias");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/tool-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usuarioId: user.id,
          toolName: formData.tool,
          model: formData.model,
          serialNumber: formData.serial,
          reason: formData.reason,
          startDate: formData.startDate,
          expectedReturnDate: formData.expectedReturnDate,
          generalPhotoUrl: generalPhoto,
          specificationsPhotoUrl: specificationsPhoto,
        }),
      });

      if (response.ok) {
        alert("Solicitud enviada con éxito");
        setShowRequest(false);
        setFormData({
          tool: "",
          model: "",
          serial: "",
          reason: "",
          startDate: new Date().toISOString().split("T")[0],
          expectedReturnDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        });
        setGeneralPhoto(null);
        setSpecificationsPhoto(null);
        loadBorrowTools();
      } else {
        console.error("Respuesta no exitosa", await response.text());
        alert("No se pudo enviar la solicitud");
      }
    } catch (error) {
      console.error("Error al enviar solicitud:", error);
      alert("Error al enviar la solicitud");
    } finally {
      setLoading(false);
    }
  };

  const loadBorrowTools = async () => {
    try {
      const response = await fetch("/api/tool-requests/my-active");
      if (response.ok) {
        const data = await response.json();
        setBorrowTools(data);
      }
    } catch (error) {
      console.error("Error al cargar herramientas:", error);
    }
  };

  const handleRenew = async (toolId: number, currentDate: string) => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + 7);
    const reason = prompt("Describe el motivo de la renovación:");
    if (!reason) return;

    try {
      const response = await fetch(`/api/tool-requests/${toolId}/renewal-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newReturnDate: newDate.toISOString(),
          renewalReason: reason,
        }),
      });

      if (!response.ok) {
        alert("No se pudo enviar la renovación");
      } else {
        alert("Renovación enviada");
        loadBorrowTools();
      }
    } catch (error) {
      console.error("Error al solicitar renovación:", error);
      alert("Error al solicitar renovación");
    }
  };

  return (
    <div className={styles.pageContainer}>
      <HelpTab module="tools-my-tools" user={user} />
      <div className={styles.pageHeader}>
        <h1>Mis herramientas</h1>
        <p>Solicita y revisa las herramientas que tienes asignadas</p>
      </div>

      <div className={styles.toolsSection}>
        <div className={styles.toolsHeader}>
          <h2>Solicitar herramienta</h2>
          <button className={styles.primaryButton} onClick={() => setShowRequest(!showRequest)}>
            {showRequest ? "Cerrar solicitud" : "Nueva solicitud"}
          </button>
        </div>

        {showRequest && (
          <div className={styles.formCard}>
            <form className={styles.fineForm} onSubmit={handleSubmit}>
              <div className={styles.formGroup}>
                <label htmlFor="tool">Nombre de la herramienta</label>
                <input
                  id="tool"
                  name="tool"
                  value={formData.tool}
                  onChange={handleFormChange}
                  className={styles.formInput}
                  placeholder="Ej. Taladro, Laptop, Equipo de seguridad"
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="model">Modelo</label>
                <input
                  id="model"
                  name="model"
                  value={formData.model}
                  onChange={handleFormChange}
                  className={styles.formInput}
                  placeholder="Modelo de la herramienta"
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="serial">Número de serie</label>
                <input
                  id="serial"
                  name="serial"
                  value={formData.serial}
                  onChange={handleFormChange}
                  className={styles.formInput}
                  placeholder="Número de serie único"
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="reason">Motivo de uso</label>
                <textarea
                  id="reason"
                  name="reason"
                  value={formData.reason}
                  onChange={handleFormChange}
                  className={styles.formInput}
                  rows={3}
                  placeholder="Describe para qué la necesitas"
                  required
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label htmlFor="startDate">Fecha de inicio del préstamo</label>
                  <input
                    id="startDate"
                    name="startDate"
                    type="date"
                    value={formData.startDate}
                    onChange={handleFormChange}
                    className={styles.formInput}
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="expectedReturnDate">Fecha esperada de devolución</label>
                  <input
                    id="expectedReturnDate"
                    name="expectedReturnDate"
                    type="date"
                    value={formData.expectedReturnDate}
                    onChange={handleFormChange}
                    min={formData.startDate}
                    className={styles.formInput}
                    required
                  />
                </div>
              </div>

              <div className={styles.photoSection}>
                <h3>Fotografías requeridas (2)</h3>
                <p className={styles.photoNote}>Ambas fotos son obligatorias para completar la solicitud</p>

                <div className={styles.photoGroup}>
                  <label>1. Foto panorámica de la herramienta</label>
                  {!generalPhoto ? (
                    <button
                      type="button"
                      className={styles.photoButton}
                      onClick={() => startCamera("general")}
                      disabled={!!photoStep}
                    >
                      📷 Tomar foto panorámica
                    </button>
                  ) : (
                    <div className={styles.photoPreview}>
                      <img src={generalPhoto} alt="Foto panorámica" />
                      <button
                        type="button"
                        className={styles.retakeButton}
                        onClick={() => retakePhoto("general")}
                      >
                        🔄 Retomar foto
                      </button>
                    </div>
                  )}
                </div>

                <div className={styles.photoGroup}>
                  <label>2. Foto del modelo y número de serie</label>
                  {!specificationsPhoto ? (
                    <button
                      type="button"
                      className={styles.photoButton}
                      onClick={() => startCamera("specifications")}
                      disabled={!!photoStep}
                    >
                      📷 Tomar foto de especificaciones
                    </button>
                  ) : (
                    <div className={styles.photoPreview}>
                      <img src={specificationsPhoto} alt="Foto especificaciones" />
                      <button
                        type="button"
                        className={styles.retakeButton}
                        onClick={() => retakePhoto("specifications")}
                      >
                        🔄 Retomar foto
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className={styles.formActions}>
                <button
                  type="submit"
                  className={styles.primaryButton}
                  disabled={!generalPhoto || !specificationsPhoto || loading}
                >
                  {loading ? "Enviando..." : "Enviar solicitud"}
                </button>
                <button type="button" className={styles.secondaryButton} onClick={() => setShowRequest(false)}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {photoStep && (
        <div className={styles.cameraModal}>
          <div className={styles.cameraContainer}>
            <div className={styles.cameraHeader}>
              <h3>
                {photoStep === "general"
                  ? "📸 Toma una foto panorámica de la herramienta"
                  : "📸 Toma una foto del modelo y número de serie"}
              </h3>
              <button className={styles.closeButton} onClick={stopCamera}>
                ✕
              </button>
            </div>
            <video ref={videoRef} className={styles.cameraVideo} />
            <canvas ref={canvasRef} style={{ display: "none" }} />
            <div className={styles.cameraControls}>
              <button type="button" className={styles.captureButton} onClick={capturePhoto}>
                📷 Capturar foto
              </button>
              <button type="button" className={styles.cancelButton} onClick={stopCamera}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.toolsSection}>
        <h2>Herramientas en uso</h2>
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Herramienta</th>
                <th>Fecha préstamo</th>
                <th>Fecha devolución</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {borrowTools.length === 0 ? (
                <tr>
                  <td colSpan={5} className={styles.emptyTableMessage}>No tienes herramientas asignadas</td>
                </tr>
              ) : (
                borrowTools.map((tool) => (
                  <tr key={tool.id}>
                    <td>{tool.toolName}</td>
                    <td>{new Date(tool.startDate).toLocaleDateString()}</td>
                    <td>{new Date(tool.expectedReturnDate).toLocaleDateString()}</td>
                    <td>{tool.status}</td>
                    <td>
                      <button
                        className={styles.secondaryButton}
                        onClick={() => handleRenew(tool.id, tool.expectedReturnDate)}
                      >
                        🔄 Renovar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}