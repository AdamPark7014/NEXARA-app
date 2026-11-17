"use client";

/**
 * Panel de vista holograma sobre la maqueta 3D: cubo de orientación, rejilla 3×3 y órbita.
 */
import ExploreOutlinedIcon from "@mui/icons-material/ExploreOutlined";
import ThreeDRotationIcon from "@mui/icons-material/ThreeDRotation";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import CenterFocusStrongIcon from "@mui/icons-material/CenterFocusStrong";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowLeftIcon from "@mui/icons-material/KeyboardArrowLeft";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import RotateLeftIcon from "@mui/icons-material/RotateLeft";
import RotateRightIcon from "@mui/icons-material/RotateRight";
import type { CaraCubo } from "@/lib/cctv/maqueta/vistaHolograma";
import styles from "./editor.module.css";

export type AccionesVistaHolograma = {
  girar: (grados: number) => void;
  inclinar: (grados: number) => void;
  desplazar: (dx: number, dy: number) => void;
  acercar: (factor: number) => void;
  encuadrar: () => void;
  cara: (c: CaraCubo) => void;
  orbita: (activa: boolean) => void;
  orbitaActiva: boolean;
};

const CARAS: { id: CaraCubo; label: string; grid: string }[] = [
  { id: "arriba", label: "Arriba", grid: "1 / 2" },
  { id: "oeste", label: "Oeste", grid: "2 / 1" },
  { id: "norte", label: "Norte", grid: "2 / 2" },
  { id: "este", label: "Este", grid: "2 / 3" },
  { id: "sur", label: "Sur", grid: "3 / 2" },
  { id: "abajo", label: "Abajo", grid: "4 / 2" },
];

export default function ControlesHolograma({ acciones }: { acciones: AccionesVistaHolograma }) {
  const { girar, inclinar, desplazar, acercar, encuadrar, cara, orbita, orbitaActiva } = acciones;
  return (
    <div className={styles.panelHolograma} role="group" aria-label="Controles de vista holograma">
      <div className={styles.cuboOrientacion} role="group" aria-label="Orientación">
        {CARAS.map((c) => (
          <button
            key={c.id}
            type="button"
            className={styles.caraCubo}
            style={{ gridArea: c.grid }}
            aria-label={`Vista desde ${c.label.toLowerCase()}`}
            title={c.label}
            onClick={() => cara(c.id)}
          >
            {c.id === "norte" ? <ExploreOutlinedIcon fontSize="inherit" /> : c.label[0]}
          </button>
        ))}
      </div>

      <div className={styles.rejillaVista} role="group" aria-label="Rejilla de vista">
        <button type="button" aria-label="Inclinar arriba" onClick={() => inclinar(10)}>
          <KeyboardArrowUpIcon fontSize="small" />
        </button>
        <button type="button" aria-label="Girar a la izquierda" onClick={() => girar(-15)}>
          <RotateLeftIcon fontSize="small" />
        </button>
        <button type="button" aria-label="Centrar y encuadrar" onClick={() => encuadrar()}>
          <CenterFocusStrongIcon fontSize="small" />
        </button>
        <button type="button" aria-label="Girar a la derecha" onClick={() => girar(15)}>
          <RotateRightIcon fontSize="small" />
        </button>
        <button type="button" aria-label="Inclinar abajo" onClick={() => inclinar(-10)}>
          <KeyboardArrowDownIcon fontSize="small" />
        </button>
        <button type="button" aria-label="Mover a la izquierda" onClick={() => desplazar(-2, 0)}>
          <KeyboardArrowLeftIcon fontSize="small" />
        </button>
        <button type="button" aria-label="Mover adelante" onClick={() => desplazar(0, 2)}>
          <KeyboardArrowUpIcon fontSize="small" />
        </button>
        <button type="button" aria-label="Mover a la derecha" onClick={() => desplazar(2, 0)}>
          <KeyboardArrowRightIcon fontSize="small" />
        </button>
        <button type="button" aria-label="Mover atrás" onClick={() => desplazar(0, -2)}>
          <KeyboardArrowDownIcon fontSize="small" />
        </button>
        <button type="button" aria-label="Acercar" onClick={() => acercar(1.25)}>
          <ZoomInIcon fontSize="small" />
        </button>
        <button type="button" aria-label="Alejar" onClick={() => acercar(0.8)}>
          <ZoomOutIcon fontSize="small" />
        </button>
      </div>

      <button
        type="button"
        className={styles.orbitaAuto}
        aria-pressed={orbitaActiva}
        aria-label="Órbita automática"
        title="Gira lento alrededor del sitio hasta que toques la maqueta"
        onClick={() => orbita(!orbitaActiva)}
      >
        <ThreeDRotationIcon fontSize="small" />
        Órbita automática
      </button>
    </div>
  );
}