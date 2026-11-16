"use client";

/**
 * «Revisar con IA» en la ficha de una actividad (Adam, 15-11-2026): los hechos medibles (a tiempo,
 * fotos por elemento, incidencias, calificación) y si la calificación les corresponde, con el porqué.
 * Solo informa: la calificación se corrige en «Revisar» como siempre. API: `POST ai/revision/actividad/:id`.
 */
import { useState } from "react";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import { useUser } from "@/components/UserContext";
import { Alert, Badge, Button, RecordSection } from "@/components/base";
import { erpFetch, formatApiError } from "@/lib/erp-api";
import { hasAnyPermission, PERMISSIONS } from "@/lib/permissions";

export type HechoRevision = { texto: string; tono: "bien" | "mal" | "neutro" };
export type ResultadoRevision = {
  hechos: HechoRevision[];
  ia: {
    veredicto: "correcta" | "revisar" | "incorrecta";
    calificacionSugerida: number | null;
    porque: string[];
    incidencias: string[];
    recomendacion: string | null;
  } | null;
  avisoIa: string | null;
};

const VEREDICTO: Record<NonNullable<ResultadoRevision["ia"]>["veredicto"], { texto: string; tono: "success" | "warning" | "danger" }> = {
  correcta: { texto: "La calificación corresponde", tono: "success" },
  revisar: { texto: "Hay que revisarla", tono: "warning" },
  incorrecta: { texto: "La calificación no corresponde", tono: "danger" },
};

const COLOR: Record<HechoRevision["tono"], string> = {
  bien: "var(--ui-success, #15803d)",
  mal: "var(--ui-danger, #b91c1c)",
  neutro: "var(--ui-fg-3, #6b7280)",
};

export default function RevisionConIA({ activityId }: { activityId: number }) {
  const { token, user } = useUser();
  const [resultado, setResultado] = useState<ResultadoRevision | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!hasAnyPermission(user, [PERMISSIONS.EVIDENCES_REVIEW, PERMISSIONS.ACTIVITIES_MANAGE])) return null;

  async function revisar() {
    if (!token) return;
    setCargando(true);
    setError(null);
    try {
      setResultado(await erpFetch<ResultadoRevision>(`ai/revision/actividad/${activityId}`, token, { method: "POST" }));
    } catch (e) {
      setError(formatApiError(e, "No se pudo revisar la actividad"));
    } finally {
      setCargando(false);
    }
  }

  const ia = resultado?.ia ?? null;
  return (
    <RecordSection title="Revisión con IA" subtitle="Si la calificación corresponde a lo que pasó: tiempo, fotos e incidencias.">
      <div style={{ display: "grid", gap: 10 }} data-testid="revision-ia">
        {!resultado ? (
          <div>
            <Button variant="secondary" onClick={() => void revisar()} loading={cargando} iconStart={<AutoAwesomeOutlinedIcon fontSize="small" />}>
              {cargando ? "Revisando…" : "Revisar con IA"}
            </Button>
          </div>
        ) : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {resultado ? (
          <>
            {ia ? (
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                <Badge tone={VEREDICTO[ia.veredicto].tono}>{VEREDICTO[ia.veredicto].texto}</Badge>
                {ia.calificacionSugerida != null ? <span style={{ fontSize: 13 }}>Calificación sugerida: {ia.calificacionSugerida} de 5</span> : null}
              </div>
            ) : null}
            {resultado.avisoIa ? <Alert tone="warning">{resultado.avisoIa}</Alert> : null}
            <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4, fontSize: 13 }} aria-label="Hechos">
              {resultado.hechos.map((h) => (
                <li key={h.texto} style={{ color: COLOR[h.tono] }}>
                  {h.texto}
                </li>
              ))}
            </ul>
            {ia?.porque.length ? (
              <div style={{ fontSize: 13 }}>
                <strong>Por qué: </strong>
                {ia.porque.join(" ")}
              </div>
            ) : null}
            {ia?.incidencias.length ? (
              <div style={{ fontSize: 13 }}>
                <strong>A atender:</strong>
                <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                  {ia.incidencias.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {ia?.recomendacion ? <div style={{ fontSize: 13 }}><strong>Qué hacer: </strong>{ia.recomendacion}</div> : null}
            <div>
              <Button size="sm" variant="ghost" onClick={() => void revisar()} loading={cargando}>
                Volver a revisar
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </RecordSection>
  );
}
