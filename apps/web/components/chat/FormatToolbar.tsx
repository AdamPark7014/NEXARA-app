"use client";

import type { SvgIconComponent } from "@mui/icons-material";
import FormatBoldIcon from "@mui/icons-material/FormatBold";
import FormatItalicIcon from "@mui/icons-material/FormatItalic";
import StrikethroughSIcon from "@mui/icons-material/StrikethroughS";
import LinkIcon from "@mui/icons-material/Link";
import FormatListNumberedIcon from "@mui/icons-material/FormatListNumbered";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import FormatQuoteIcon from "@mui/icons-material/FormatQuote";
import CodeIcon from "@mui/icons-material/Code";
import DataObjectIcon from "@mui/icons-material/DataObject";
import styles from "../WorkspaceChat.module.css";
import type { AccionFormato } from "./formato";

type Boton = { accion: AccionFormato; etiqueta: string; atajo?: string; Icon: SvgIconComponent };

const GRUPOS: Boton[][] = [
  [
    { accion: "negrita", etiqueta: "Negrita", atajo: "Ctrl+B", Icon: FormatBoldIcon },
    { accion: "cursiva", etiqueta: "Cursiva", atajo: "Ctrl+I", Icon: FormatItalicIcon },
    { accion: "tachado", etiqueta: "Tachado", atajo: "Ctrl+Shift+X", Icon: StrikethroughSIcon },
  ],
  [
    { accion: "enlace", etiqueta: "Enlace", atajo: "Ctrl+Shift+U", Icon: LinkIcon },
    { accion: "listaNumerada", etiqueta: "Lista numerada", Icon: FormatListNumberedIcon },
    { accion: "listaViñetas", etiqueta: "Lista con viñetas", Icon: FormatListBulletedIcon },
  ],
  [
    { accion: "cita", etiqueta: "Cita", Icon: FormatQuoteIcon },
    { accion: "codigo", etiqueta: "Código", atajo: "Ctrl+Shift+C", Icon: CodeIcon },
    { accion: "bloqueCodigo", etiqueta: "Bloque de código", Icon: DataObjectIcon },
  ],
];

/**
 * Barra de formato del redactor. Los botones no se quedan con el foco (`mousedown` prevenido) para
 * que la selección del `textarea` siga viva cuando se aplica el formato.
 */
export default function FormatToolbar({
  onFormat,
  disabled,
}: {
  onFormat: (accion: AccionFormato) => void;
  disabled?: boolean;
}) {
  return (
    <div className={styles.fmtBar} role="toolbar" aria-label="Formato del mensaje">
      {GRUPOS.map((grupo, gi) => (
        <span key={gi} className={styles.fmtGroup}>
          {gi > 0 ? <span className={styles.fmtSep} aria-hidden="true" /> : null}
          {grupo.map(({ accion, etiqueta, atajo, Icon }) => {
            const tip = atajo ? `${etiqueta} (${atajo})` : etiqueta;
            return (
              <button
                key={accion}
                type="button"
                className={styles.fmtBtn}
                aria-label={etiqueta}
                data-tip={tip}
                disabled={disabled}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onFormat(accion)}
              >
                <Icon aria-hidden="true" sx={{ fontSize: 17 }} />
              </button>
            );
          })}
        </span>
      ))}
    </div>
  );
}
