"use client";

import { useId, useState } from "react";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";

/**
 * La explicación detrás de una ⓘ.
 *
 * La pantalla no lleva párrafos de ayuda: quien ya sabe no los lee y quien no sabe los
 * necesita una vez. Se abre, se lee, se cierra.
 */
export default function InfoBreve({ texto, etiqueta }: { texto: string; etiqueta: string }) {
  const id = useId();
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label={etiqueta}
        aria-expanded={abierto}
        aria-controls={abierto ? id : undefined}
        title={etiqueta}
        onClick={() => setAbierto((v) => !v)}
        style={{
          appearance: "none",
          border: "none",
          borderRadius: 6,
          background: "transparent",
          padding: 2,
          cursor: "pointer",
          lineHeight: 0,
          // El icono hay que reconocerlo: `--ui-icon` existe justo para esto.
          color: abierto ? "var(--primary)" : "var(--ui-icon, var(--text-secondary))",
        }}
      >
        <InfoOutlinedIcon aria-hidden="true" sx={{ fontSize: 16 }} />
      </button>
      {abierto && (
        // Sin caja: una regla a la izquierda basta para separar la explicación
        // del resto, y no añade otro rectángulo a la pantalla.
        <p
          id={id}
          style={{
            margin: "10px 0 0",
            paddingLeft: 12,
            borderLeft: "2px solid var(--nx-panel-hairline, var(--border))",
            maxWidth: "62ch",
            fontSize: 12,
            lineHeight: 1.55,
            color: "var(--text-secondary)",
          }}
        >
          {texto}
        </p>
      )}
    </>
  );
}
