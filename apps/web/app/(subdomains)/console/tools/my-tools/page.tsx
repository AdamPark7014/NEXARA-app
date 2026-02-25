"use client";

import { useState, useRef } from "react";
import styles from "../../console.module.css";
import { useUser } from "@/components/UserContext";
import { hasAnyPermission, PERMISSIONS } from "@/lib/permissions";

export default function MyToolsPage() {
  const { user } = useUser();
  const [showRequest, setShowRequest] = useState(false);
  const [photoStep, setPhotoStep] = useState<"general" | "specifications" | null>(null);
  const [generalPhoto, setGeneralPhoto] = useState<string | null>(null);
  const [specificationsPhoto, setSpecificationsPhoto] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

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
        videoRef.current.play();
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

  return (
    <div className={styles.pageContainer}>
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
            <form className={styles.fineForm}>
              <div className={styles.formGroup}>
                <label htmlFor="tool">Nombre de la herramienta</label>
                <input id="tool" className={styles.formInput} placeholder="Ej. Taladro, Laptop, Equipo de seguridad" required />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="model">Modelo</label>
                <input id="model" className={styles.formInput} placeholder="Modelo de la herramienta" required />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="serial">Número de serie</label>
                <input id="serial" className={styles.formInput} placeholder="Número de serie único" required />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="reason">Motivo de uso</label>
                <textarea id="reason" className={styles.formInput} rows={3} placeholder="Describe para qué la necesitas" required />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="period">Periodo estimado de uso</label>
                <input id="period" className={styles.formInput} placeholder="Ej. 3 días, 1 semana" required />
              </div>

              {/* Fotos requeridas */}
              <div className={styles.photoSection}>
                <h3>Fotografías requeridas (2)</h3>
                <p className={styles.photoNote}>Ambas fotos son obligatorias para completar la solicitud</p>

                {/* Foto general */}
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

                {/* Foto especificaciones */}
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
                  disabled={!generalPhoto || !specificationsPhoto}
                >
                  Enviar solicitud
                </button>
                <button type="button" className={styles.secondaryButton} onClick={() => setShowRequest(false)}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Modal de cámara */}
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
                <th>Observaciones</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={5} className={styles.emptyTableMessage}>No tienes herramientas asignadas</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
