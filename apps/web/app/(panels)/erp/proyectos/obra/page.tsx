"use client";

/**
 * Obra, el retroanálisis (Velocidad Core, Ola 5; Adam: «que el arquitecto tenga todo el retroanálisis de
 * toda la parte de obra»). Lo que de verdad tomó cada trabajo contra lo que se calculó. Mientras las
 * actividades no estén ligadas, el sitio sale del título; ligarlas abre plan contra real por proyecto.
 */
import { useCallback, useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import DataTable, { type Column } from "@/components/ui/DataTable";
import InlineAlert from "@/components/ui/InlineAlert";
import Modal from "@/components/ui/Modal";
import { toast } from "@/components/Toast";
import { DashCol, DashGrid, DashHero, DashPage, DashPanel, DashSkeleton, ListRow, StatStrip } from "@/components/dashboard/DashKit";
import { useUser } from "@/components/UserContext";
import { fetchObra, horasCortas, ligarObra, type ObraResponse } from "@/lib/direccion-api";
import { formatApiError } from "@/lib/erp-api";
import { listarProyectos, type ProyectoFila } from "@/lib/proyectos-api";
import { useRegreso } from "@/lib/regreso";

type Tipo = ObraResponse["porTipo"][number];
type Sitio = ObraResponse["porSitio"][number];

export default function ObraPage() {
  const { token } = useUser();
  const regreso = useRegreso({ href: "/erp/proyectos", label: "Proyectos" });
  const [datos, setDatos] = useState<ObraResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ligando, setLigando] = useState<Sitio | null>(null);
  const [proyectos, setProyectos] = useState<ProyectoFila[]>([]);
  const [proyecto, setProyecto] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    if (!token) return;
    try {
      setDatos(await fetchObra(token));
      setError(null);
    } catch (e) {
      setError(formatApiError(e, "No se pudo abrir Obra"));
    }
  }, [token]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const abrirLigar = async (sitio: Sitio) => {
    setLigando(sitio);
    setProyecto("");
    if (token && !proyectos.length) {
      try {
        setProyectos(await listarProyectos(token));
      } catch (e) {
        setError(formatApiError(e, "No se pudieron traer los proyectos"));
      }
    }
  };

  const ligar = async () => {
    if (!token || !ligando || !proyecto) return;
    setGuardando(true);
    try {
      const r = await ligarObra(token, ligando.sinProyecto, Number(proyecto));
      toast.success(`${r.ligadas} ${r.ligadas === 1 ? "actividad ligada" : "actividades ligadas"} al proyecto`);
      setLigando(null);
      await cargar();
    } catch (e) {
      toast.error(formatApiError(e, "No se pudieron ligar"));
    } finally {
      setGuardando(false);
    }
  };

  const columnas: Column<Tipo>[] = [
    { key: "tipo", label: "Trabajo", render: (f) => <b style={{ fontWeight: 600 }}>{f.tipo}</b> },
    { key: "veces", label: "Veces", align: "right", numeric: true, render: (f) => f.veces },
    { key: "real", label: "Real", align: "right", numeric: true, render: (f) => horasCortas(f.realMin) },
    { key: "calc", label: "Calculado", align: "right", numeric: true, render: (f) => horasCortas(f.calculadoMin) },
  ];

  return (
    <DashPage>
      <DashHero
        eyebrow={regreso.label}
        title="Obra"
        subtitle="Lo que de verdad tomó cada trabajo contra lo que se calculó"
        actions={<Button variant="ghost" onClick={() => window.location.assign(regreso.href)}>← {regreso.label}</Button>}
      />
      {error ? <InlineAlert variant="danger" message={error} /> : null}
      {!datos && !error ? (
        <DashPanel title="Por tipo de trabajo">
          <DashSkeleton rows={4} height={20} gap={10} />
        </DashPanel>
      ) : null}
      {datos ? (
        <>
          <StatStrip
            stats={[
              { label: "Actividades de obra terminadas", value: datos.actividades },
              { label: "En reloj", value: `${Math.round(datos.minutos / 60).toLocaleString("es-MX")} h` },
              { label: "Ligadas a un proyecto", value: datos.ligadas, sub: `de ${datos.actividades}` },
              { label: "Diseños de cámaras", value: datos.disenos ?? "—" },
            ]}
          />
          <DashGrid>
            <DashCol span={7}>
              <DashPanel title="Por tipo de trabajo" subtitle="Mediana de cada tipo. Lo que dicen las personas al terminar manda sobre el reloj.">
                <DataTable columns={columnas} rows={datos.porTipo} rowKey={(f) => f.tipo} ariaLabel="Por tipo de trabajo" stickyHeader={false} />
              </DashPanel>
            </DashCol>
            <DashCol span={5}>
              <DashPanel title="Por sitio" subtitle="Sale del título mientras no estén ligadas a un proyecto" flush>
                {datos.porSitio.map((f) => (
                  <ListRow
                    key={f.sitio}
                    title={f.sitio}
                    sub={`${f.actividades} ${f.actividades === 1 ? "actividad" : "actividades"} · ${horasCortas(f.minutos)}`}
                    trail={
                      f.sinProyecto.length ? (
                        <Button size="sm" variant="secondary" onClick={() => void abrirLigar(f)}>
                          Ligar {f.sinProyecto.length}
                        </Button>
                      ) : (
                        "Ligadas"
                      )
                    }
                  />
                ))}
              </DashPanel>
            </DashCol>
          </DashGrid>
        </>
      ) : null}
      {ligando ? (
        <Modal open onClose={() => setLigando(null)} title={`Ligar ${ligando.sinProyecto.length} de ${ligando.sitio} a un proyecto`}>
          <div style={{ display: "grid", gap: 12 }}>
            <label style={{ display: "grid", gap: 4 }}>
              Proyecto
              <select value={proyecto} onChange={(e) => setProyecto(e.target.value)}>
                <option value="">Elige un proyecto</option>
                {proyectos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>
            <p style={{ margin: 0, color: "var(--ui-fg-2)", fontSize: 13 }}>Solo se ligan. No cambian de estatus ni se avisa a nadie.</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button variant="ghost" onClick={() => setLigando(null)}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={() => void ligar()} disabled={!proyecto || guardando} loading={guardando}>
                Ligar
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </DashPage>
  );
}
