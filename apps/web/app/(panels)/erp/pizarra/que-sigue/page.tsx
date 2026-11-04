"use client";

/**
 * Lo que le saldría a cada persona en «¿Qué sigue?» (Velocidad Core, Ola 6). Para dirección, que no tiene
 * Mis actividades ni entra con la cuenta de nadie. De solo lectura y sin sus pendientes, que son suyos.
 */
import { useEffect, useState } from "react";
import { Alert, Select } from "@/components/base";
import { DashHero, DashPage, DashPanel, DashSkeleton } from "@/components/dashboard/DashKit";
import { useUser } from "@/components/UserContext";
import { personasAsignables, type PersonaAsignable } from "@/lib/asistente-ia-api";
import { formatApiError } from "@/lib/erp-api";
import { fetchQueSigueDe, type QueSigue } from "@/lib/que-sigue-api";
import s from "@/components/pizarra/QueSigue.module.css";

export default function QueSiguePorPersonaPage() {
  const { token } = useUser();
  const [personas, setPersonas] = useState<PersonaAsignable[]>([]);
  const [userId, setUserId] = useState("");
  const [datos, setDatos] = useState<(QueSigue & { nombre: string }) | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    personasAsignables(token)
      .then((lista) => {
        setPersonas(lista);
        const pedida = new URLSearchParams(window.location.search).get("de");
        setUserId(pedida ?? (lista[0] ? String(lista[0].id) : ""));
      })
      .catch((e) => setError(formatApiError(e, "No se pudo traer a la gente")));
  }, [token]);

  useEffect(() => {
    if (!token || !userId) return;
    let vigente = true;
    setCargando(true);
    setError(null);
    fetchQueSigueDe(token, Number(userId))
      .then((d) => {
        if (vigente) setDatos(d);
      })
      .catch((e) => {
        if (vigente) setError(formatApiError(e, "No se pudo calcular"));
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [token, userId]);

  return (
    <DashPage>
      <DashHero eyebrow="Tu gente" title="¿Qué sigue?, por persona" subtitle="Lo que le sale a cada quien cuando no trae nada corriendo. Sus pendientes no se ven: son suyos." />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <DashPanel title="Persona">
        <Select aria-label="Persona" value={userId} onChange={(e) => setUserId(e.target.value)}>
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </Select>
      </DashPanel>
      <DashPanel title={datos ? `Lo que ve ${datos.nombre.split(/\s+/)[0]}` : "Lo que ve"} subtitle={datos?.area ? `Área: ${datos.area}` : undefined}>
        {cargando && !datos ? <DashSkeleton rows={4} height={20} gap={10} /> : null}
        {datos && !datos.aplica ? <p className={s.nota}>A dirección no le aplica.</p> : null}
        {datos?.aplica ? (
          <div className={s.bloque}>
            <ul className={s.lista}>
              {datos.sugerencias.map((q) => (
                <li key={q.clave} className={s.fila}>
                  <div className={s.texto}>
                    <strong>{q.titulo}</strong>
                    {q.detalle ? <small>{q.detalle}</small> : null}
                  </div>
                  <span className={s.nota}>{q.accion === "abrir" ? "Abrir" : "Empezar"}</span>
                </li>
              ))}
            </ul>
            {datos.resumen ? <p className={s.nota}>{datos.resumen}</p> : null}
          </div>
        ) : null}
      </DashPanel>
    </DashPage>
  );
}
