"use client";

import Button from "@/components/ui/Button";

type Props = {
  onExcel?: () => void;
  onPdf?: () => void;
  excelDisabled?: boolean;
  pdfDisabled?: boolean;
  excelBusy?: boolean;
  pdfBusy?: boolean;
  size?: "sm" | "md";
  /** Si true, oculta el botón cuyo handler no está definido. */
  hideMissing?: boolean;
};

/**
 * Patrón consistente Exportar Excel / Exportar PDF en listas HR·Ops·Finance.
 */
export default function ListExportActions({
  onExcel,
  onPdf,
  excelDisabled,
  pdfDisabled,
  excelBusy,
  pdfBusy,
  size = "sm",
  hideMissing = true,
}: Props) {
  const showExcel = !!onExcel || !hideMissing;
  const showPdf = !!onPdf || !hideMissing;
  if (!showExcel && !showPdf) return null;

  return (
    <div style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      {showExcel ? (
        <Button
          variant="ghost"
          size={size}
          iconLeft="⬇"
          disabled={excelDisabled || excelBusy || !onExcel}
          onClick={() => onExcel?.()}
        >
          {excelBusy ? "Generando…" : "Exportar Excel"}
        </Button>
      ) : null}
      {showPdf ? (
        <Button
          variant="ghost"
          size={size}
          iconLeft="📄"
          disabled={pdfDisabled || pdfBusy || !onPdf}
          onClick={() => onPdf?.()}
        >
          {pdfBusy ? "Generando…" : "Exportar PDF"}
        </Button>
      ) : null}
    </div>
  );
}
