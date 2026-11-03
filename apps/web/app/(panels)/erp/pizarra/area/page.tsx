"use client";

/**
 * Mi área (Velocidad Core, Ola 5): la misma lectura de dirección, solo con la gente de quien mira.
 * Dirección abre la de cualquier encargado con `?encargado=`. Primero quien necesita algo: hoy el
 * semáforo sale rojo a casi todos, y un color igual para todos no ordena nada.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { DashCol, DashEmpty, DashGrid, DashHero, DashPage, DashPanel, DashSkeleton, StatStrip } from "@/components/dashboard/DashKit";
import { useUser } from "@/components/UserContext";
import InlineAlert from "@/components/ui/InlineAlert";
import DataTable, { type Column } from "@/components/ui/DataTable";
import { fetchArea, porcentaje, type AreaResponse, type FilaArea } from "@/lib/direccion-api";
import { formatApiError } from "@/lib/erp-api";
import { aqui, conRegreso } from "@/lib/regreso";

export default function MiAreaPage() {
  const { user, token } = useUser();
  const [datos, setDatos] = useState<AreaResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let vigente = true;
    const encargado = Number(new URLSearchParams(window.location.search).get("encargado"));
    fetchArea(token, Number.isInteger(encargado) && encargado > 0 ? encargado : null)
      .then((d) => {
        if (vigente) setDatos(d);
      })
      .catch((e) => {
        if (vigente) setError(formatApiError(e, "No se pudo abrir el área"));
      });
    return () => {
      vigente = false;
    };
  }, [token]);

  const propia = !datos || datos.encargado.id === user?.id;
  const titulo = propia ? "Mi área" : `Área de ${datos.encargado.nombre.split(/\s+/).slice(0, 2).join(" ")}`;
  const columnas: Column<FilaArea>[] = [
    {
      key: "persona",
      label: "Persona",
      render: (f) => (
        <Link href={conRegreso(`/erp/asistencias/indicadores/${f.id}`, aqui())} style={{ fontWeight: 600, color: "inherit" }}>
          {f.nombre}
        </Link>
      ),
    },
    { key: "entregas", label: "Entregas", align: "right", numeric: true, render: (f) => f.entregas },
    { key: "aTiempo", label: "A tiempo", align: "right", numeric: true, render: (f) => porcentaje(f.pctATiempo) },
    { key: "puntual", label: "Puntual", align: "right", numeric: true, render: (f) => porcentaje(f.pctPuntual) },
    { key: "sinChecar", label: "Sin checar", align: "right", numeric: true, render: (f) => f.diasSinChecada },
    { key: "revisar", label: "Por revisar", align: "right", numeric: true, render: (f) => f.porRevisar },
    { key: "pasa", label: "Qué pasa", render: (f) => f.queLePasa ?? "Todo en orden" },
  ];

  return (
    <DashPage>
      <DashHero eyebrow="Tu gente" title={titulo} subtitle={datos ? `${datos.resumen.personas} personas · últimos 30 días` : "Reuniendo a tu gente…"} />
      {error ? <InlineAlert variant="danger" message={error} /> : null}
      {!datos && !error ? (
        <DashPanel title="Su gente">
          <DashSkeleton rows={4} height={20} gap={10} />
        </DashPanel>
      ) : null}
      {datos && datos.resumen.personas === 0 ? (
        datos.resumen.porRevisar > 0 ? (
          <DashEmpty
            title={`${datos.resumen.porRevisar} evidencias por revisar`}
            description="Las revisas por encargo; su gente sigue con su jefe."
            action={<Link href="/erp/pizarra?vista=revision">Revisar</Link>}
          />
        ) : (
          <DashEmpty title="Aún no tienes gente a cargo" description="Cuando alguien reporte contigo, aquí verás cómo va." />
        )
      ) : null}
      {datos && datos.resumen.personas > 0 ? (
        <>
          <StatStrip
            stats={[
              { label: "Entregado a tiempo", value: porcentaje(datos.resumen.pctATiempo), sub: `${datos.resumen.aTiempo} de ${datos.resumen.medidas}` },
              { label: "Llegaron puntuales", value: porcentaje(datos.resumen.pctPuntual), sub: `${datos.resumen.puntuales} de ${datos.resumen.esperados} días` },
              { label: "Días sin checar", value: datos.resumen.diasSinChecada },
              { label: "Evidencias por revisar", value: datos.resumen.porRevisar, sub: <Link href="/erp/pizarra?vista=revision">Revisar</Link> },
            ]}
          />
          <DashGrid>
            <DashCol span={12}>
              <DashPanel title="Su gente" subtitle="Primero quien necesita algo">
                <DataTable columns={columnas} rows={datos.gente} rowKey={(f) => f.id} ariaLabel="Su gente" stickyHeader={false} />
              </DashPanel>
            </DashCol>
          </DashGrid>
        </>
      ) : null}
    </DashPage>
  );
}
