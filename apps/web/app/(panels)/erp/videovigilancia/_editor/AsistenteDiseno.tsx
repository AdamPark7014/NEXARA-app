"use client";

/**
 * Armar con IA, para quien no quiere dibujar: se cuenta el sitio con palabras o se elige una plantilla.
 * La IA solo saca unos cuantos datos de la frase; el diseño lo arma `generarSitio` aquí mismo, y las
 * plantillas ni siquiera la llaman. Lo que sale son las mismas piezas de siempre: se ajusta y se deshace.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { Alert, Button } from "@/components/base";
import { leerFraseDeSitio } from "@/lib/cctv/api";
import { generarSitio, PLANTILLAS, type DisenoGenerado } from "@/lib/cctv/generarSitio";
import styles from "./editor.module.css";

const MAX_FRASE = 1500;

export default function AsistenteDiseno({
  token,
  hayContenido,
  onCerrar,
  onArmado,
}: {
  token: string;
  /** Si ya hay algo dibujado, se avisa que se reemplaza. */
  hayContenido: boolean;
  onCerrar: () => void;
  onArmado: (d: DisenoGenerado) => void;
}) {
  const [frase, setFrase] = useState("");
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !leyendo) onCerrar();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [leyendo, onCerrar]);

  const armar = async () => {
    const texto = frase.trim();
    if (!texto || leyendo) return;
    setLeyendo(true);
    setError(null);
    try {
      onArmado(generarSitio(await leerFraseDeSitio(token, texto)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo armar. Prueba con una plantilla.");
      setLeyendo(false);
    }
  };

  return createPortal(
    <div className={styles.asistenteFondo} role="dialog" aria-modal="true" aria-label="Armar el diseño con IA">
      <div className={styles.asistente}>
        <header>
          <h2>
            <AutoAwesomeRoundedIcon fontSize="small" />
            Armar el diseño con IA
          </h2>
          <Button variant="ghost" icon aria-label="Cerrar" title="Cerrar" onClick={onCerrar} disabled={leyendo}>
            <CloseRoundedIcon fontSize="small" />
          </Button>
        </header>
        <p className={styles.asistenteAyuda}>Cuéntame cómo es el sitio con tus palabras. Se arma solo y luego ajustas lo que quieras.</p>
        <textarea
          className={styles.asistenteFrase}
          rows={3}
          maxLength={MAX_FRASE}
          value={frase}
          autoFocus
          disabled={leyendo}
          aria-label="Cómo es el sitio"
          placeholder="Bodega de 40 por 25 con oficinas al frente, cuarto de TI y patio de maniobras. 12 cámaras Dahua y control de acceso en la entrada."
          onChange={(e) => setFrase(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void armar();
          }}
        />
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div className={styles.asistenteAcciones}>
          <span>{hayContenido ? "Reemplaza lo que ya está dibujado. Se deshace con Ctrl+Z." : "No se guarda nada hasta que lo veas."}</span>
          <Button variant="primary" loading={leyendo} disabled={!frase.trim()} onClick={() => void armar()}>
            Armar con IA
          </Button>
        </div>
        <p className={styles.seccion}>O empieza con una plantilla</p>
        <div className={styles.asistentePlantillas}>
          {PLANTILLAS.map((p) => (
            <button key={p.id} type="button" disabled={leyendo} onClick={() => onArmado(generarSitio(p.espec))}>
              <b>{p.nombre}</b>
              <span>{p.descripcion}</span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
