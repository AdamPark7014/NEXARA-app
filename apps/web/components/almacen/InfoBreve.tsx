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
          background: "transparent",
          padding: 2,
          cursor: "pointer",
          lineHeight: 0,
          color: abierto ? "var(--primary)" : "var(--text-tertiary)",
        }}
      >
        <InfoOutlinedIcon aria-hidden="true" sx={{ fontSize: 16 }} />
      </button>
      {abierto && (
        <p
          id={id}
          style={{
            margin: "8px 0 0",
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid var(--nx-panel-hairline)",
            background: "var(--surface-2)",
            fontSize: 12,
            lineHeight: 1.5,
            color: "var(--text-secondary)",
          }}
        >
          {texto}
        </p>
      )}
    </>
  );
}
