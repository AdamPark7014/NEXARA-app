"use client";

import { useEffect, useMemo, useState } from "react";
import CakeOutlinedIcon from "@mui/icons-material/CakeOutlined";
import CelebrationOutlinedIcon from "@mui/icons-material/CelebrationOutlined";
import CloseIcon from "@mui/icons-material/Close";
import { IconBadge } from "@/components/ui/IconBadge";
import { resolveUserAvatarUrl } from "@/lib/user-avatar";
import {
  celebracionCerrada,
  cerrarCelebracion,
  fetchCelebracionesHoy,
  ordenarCelebraciones,
  textoCelebracion,
  type CelebracionesHoy,
} from "@/lib/celebraciones";

/** Renglones visibles; el resto se resume en «y N más». */
const VISIBLES = 3;
const ROSA = "#db2777";
const AMBAR = "#f59e0b";

type Props = {
  token?: string | null;
  userId?: number | null;
};

/**
 * Aviso compacto de cumpleaños y aniversarios de hoy, arriba del área de trabajo de Core.
 * Quien celebra ve su felicitación; el resto ve quién celebra. Se cierra por fecha.
 */
export default function CelebracionesBanner({ token, userId }: Props) {
  const [hoy, setHoy] = useState<CelebracionesHoy | null>(null);
  const [cerrado, setCerrado] = useState(false);

  useEffect(() => {
    if (!token) {
      setHoy(null);
      return;
    }
    let vivo = true;
    fetchCelebracionesHoy(token)
      .then((data) => {
        if (!vivo) return;
        setCerrado(data ? celebracionCerrada(data.fecha, userId) : false);
        setHoy(data);
      })
      .catch(() => {
        if (vivo) setHoy(null);
      });
    return () => {
      vivo = false;
    };
  }, [token, userId]);

  const lista = useMemo(() => ordenarCelebraciones(hoy?.celebraciones ?? []), [hoy]);

  if (!hoy || cerrado || lista.length === 0) return null;

  const visibles = lista.slice(0, VISIBLES);
  const resto = lista.slice(VISIBLES);
  const propia = lista[0].soyYo;
  const icono = lista[0].tipo === "cumpleanos" ? CakeOutlinedIcon : CelebrationOutlinedIcon;
  const mezcla = propia ? 16 : 9;

  return (
    <aside
      aria-label="Celebraciones de hoy"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        marginBottom: 14,
        padding: "9px 10px 9px 12px",
        borderRadius: 12,
        border: `1px solid color-mix(in srgb, ${ROSA} ${propia ? 38 : 24}%, var(--border))`,
        background: `linear-gradient(90deg, color-mix(in srgb, ${ROSA} ${mezcla}%, var(--surface)) 0%, color-mix(in srgb, ${AMBAR} ${mezcla}%, var(--surface)) 100%)`,
        color: "var(--text-primary)",
      }}
    >
      <IconBadge icon={icono} color={ROSA} size={34} />
      <div style={{ minWidth: 0, flex: 1, display: "grid", gap: 3 }}>
        {visibles.map((c) => {
          const { titulo, detalle } = textoCelebracion(c);
          const avatar = resolveUserAvatarUrl(c.avatarUrl);
          return (
            <div
              key={`${c.userId}-${c.tipo}`}
              style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}
            >
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatar}
                  alt=""
                  width={22}
                  height={22}
                  style={{ borderRadius: "50%", objectFit: "cover", flex: "0 0 auto" }}
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : null}
              <span style={{ fontSize: 13.5, lineHeight: 1.35, minWidth: 0 }}>
                <strong style={{ fontWeight: 700 }}>{titulo}</strong>
                {detalle ? <span style={{ color: "var(--text-secondary)" }}> {detalle}</span> : null}
              </span>
            </div>
          );
        })}
        {resto.length > 0 ? (
          <div
            style={{ fontSize: 12, color: "var(--text-secondary)" }}
            title={resto.map((c) => textoCelebracion(c).titulo).join("\n")}
          >
            y {resto.length} {resto.length === 1 ? "celebración" : "celebraciones"} más hoy
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => {
          cerrarCelebracion(hoy.fecha, userId);
          setCerrado(true);
        }}
        aria-label="Ocultar aviso de celebraciones por hoy"
        title="Ocultar por hoy"
        style={{
          flex: "0 0 auto",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 30,
          height: 30,
          borderRadius: 8,
          border: "none",
          background: "transparent",
          color: "var(--text-secondary)",
          cursor: "pointer",
        }}
      >
        <CloseIcon aria-hidden="true" sx={{ fontSize: 18 }} />
      </button>
    </aside>
  );
}
