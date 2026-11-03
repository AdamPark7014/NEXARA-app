"use client";

/**
 * Hoy de dirección (Velocidad Core, Ola 5): entender todo sin abrir nada. Va debajo de «Tu día» en la
 * vista ejecutiva. Si falla, no estorba: el resto de la pantalla sigue como siempre.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { DashCol, DashGrid, DashPanel, DashSkeleton, ListRow, StatStrip } from "@/components/dashboard/DashKit";
import DataTable, { type Column } from "@/components/ui/DataTable";
import { cuadrosDeModulos, fetchDireccionHoy, porcentaje, type DireccionHoy as Datos, type FilaEncargado } from "@/lib/direccion-api";
import s from "./DireccionHoy.module.css";

const num = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("es-MX"));

function diaCorto(fecha: string | null): string {
  if (!fecha) return "Sin checadas";
  const [, m, d] = fecha.split("-");
  return `Último día con checadas: ${d}-${m}`;
}

export default function DireccionHoy({ token }: { token: string }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    let vigente = true;
    fetchDireccionHoy(token)
      .then((d) => {
        if (vigente) setDatos(d);
      })
      .catch(() => {
        if (vigente) setFallo(true);
      });
    return () => {
      vigente = false;
    };
  }, [token]);

  if (fallo) return null;
  if (!datos) {
    return (
      <DashPanel title="Hoy en NEXARA">
        <DashSkeleton rows={3} height={20} gap={10} />
      </DashPanel>
    );
  }

  const { hoy, resolvioSolo: r, porEncargado, obra, modulos } = datos;
  const columnas: Column<FilaEncargado>[] = [
    {
      key: "nombre",
      label: "Encargado",
      render: (f) => (
        <span className={s.persona}>
          <b>{f.nombre}</b>
          {f.area ? <small>{f.area}</small> : null}
        </span>
      ),
    },
    { key: "aCargo", label: "A cargo", align: "right", numeric: true, render: (f) => f.aCargo },
    { key: "aTiempo", label: "A tiempo", align: "right", numeric: true, render: (f) => porcentaje(f.pctATiempo) },
    { key: "puntual", label: "Puntual", align: "right", numeric: true, render: (f) => porcentaje(f.pctPuntual) },
    { key: "revisar", label: "Por revisar", align: "right", numeric: true, render: (f) => f.porRevisar },
    { key: "pesa", label: "Lo que más pesa", render: (f) => f.pesa ?? "—" },
    {
      key: "ver",
      label: "",
      render: (f) => (f.tipo === "equipo" ? <Link href={`/erp/pizarra/area?encargado=${f.id}`} className={s.liga}>Ver su área</Link> : null),
    },
  ];

  return (
    <>
      <StatStrip
        stats={[
          { label: "Checaron entrada", value: `${hoy.checaron} de ${hoy.de}`, sub: diaCorto(hoy.fecha) },
          { label: "Entregado a tiempo", value: porcentaje(hoy.pctATiempo), sub: `${num(hoy.aTiempo)} de ${num(hoy.medidas)} en 30 días` },
          { label: "Llegaron puntuales", value: porcentaje(hoy.pctPuntual), sub: `${num(hoy.puntuales)} de ${num(hoy.esperados)} días` },
          { label: "Evidencias sin revisar", value: num(hoy.evidenciasSinRevisar), sub: `${num(hoy.conSuJefe)} ya con su jefe` },
          { label: "Cotizaciones por vencer", value: num(hoy.cotizacionesPorVencer), sub: "En los próximos 7 días" },
        ]}
      />

      <DashPanel title="Por encargado" subtitle="Últimos 30 días">
        <DataTable
          columns={columnas}
          rows={porEncargado}
          rowKey={(f) => `${f.tipo}-${f.id}`}
          ariaLabel="Por encargado"
          emptyTitle="Sin encargados"
          stickyHeader={false}
        />
        {obra ? (
          <div className={s.obra}>
            <span>
              <b>{obra.nombre}</b> · Obra: {num(obra.ligadas)} de {num(obra.actividades)} actividades ligadas a un proyecto
            </span>
            <Link href="/erp/proyectos/obra" className={s.liga}>Ver obra</Link>
          </div>
        ) : null}
      </DashPanel>

      <DashGrid>
        <DashCol span={8}>
          <DashPanel title="Cada módulo">
            <div className={s.modulos}>
              {cuadrosDeModulos(modulos).map((c) => (
                <Link key={c.id} href={c.href} className={s.modulo} data-sin-captura={c.sinCaptura ? "true" : undefined}>
                  <span>{c.nombre}</span>
                  <b>{c.sinCaptura ? "Sin captura" : c.valor}</b>
                  <small>{c.nota}</small>
                </Link>
              ))}
            </div>
          </DashPanel>
        </DashCol>
        <DashCol span={4}>
          <DashPanel title="Lo que el sistema resolvió solo" subtitle="Últimos 7 días" flush>
            <ListRow title="Evidencias que revisaron los jefes" trail={`${num(r.revisionesDeJefes)} de ${num(r.revisiones)}`} />
            <ListRow title="Avisos que te llegaron" trail={num(r.avisos)} />
            <ListRow title="Salidas deshechas sin molestarte" trail={num(r.salidasDeshechas)} />
          </DashPanel>
        </DashCol>
      </DashGrid>
    </>
  );
}
