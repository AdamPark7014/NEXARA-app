"use client";

/**
 * Videovigilancia · catálogo de equipos (mockup aprobado 01-11-2026): lo que se puede colocar en la
 * maqueta, con su modelo 3D y su ficha. La lista base viene en el código; lo que agrega cada empresa,
 * de `cctv_equipos`. Las existencias de Almacén llegan en su fase.
 */
import { claveMarca, marcaCorta } from "@/lib/cctv/marca";
import { useEffect, useMemo, useState } from "react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import { Alert, Button, EmptyState, Input, ModulePage, Skeleton } from "@/components/base";
import { useUser } from "@/components/UserContext";
import { consultarAcceso, type EquipoParaGuardar } from "@/lib/cctv/api";
import {
  ETIQUETA_FAMILIA,
  ETIQUETA_TIPO_CAMARA,
  ETIQUETA_TIPO_EQUIPO,
  FAMILIA_DE_TIPO,
  especificacionesCamara,
  especificacionesEquipo,
  etiquetaModelo,
  type FamiliaEquipo,
  type FilaCatalogo,
} from "@/lib/cctv/catalogo";
import { fotoDeTipo } from "@/lib/cctv/sistema";
import { useCatalogo } from "@/lib/cctv/useCatalogo";
import DialogoEquipo from "../_editor/DialogoEquipo";
import MemoriaTecnica from "../_editor/MemoriaTecnica";
import styles from "./catalogo.module.css";

type Familia = FamiliaEquipo | "camaras";
type Tarjeta = {
  id: string;
  marca: string;
  familia: Familia;
  tipo: string;
  etiquetaTipo: string;
  nombre: string;
  specs: string;
  foto: string;
  /** Ficha leída del fabricante, capturada a mano o todavía por conseguir. */
  estado: "ficha" | "manual" | "falta";
  fila: FilaCatalogo | null;
  /** Para empezar un modelo nuevo a partir de este. */
  base: Partial<EquipoParaGuardar>;
};

const ORDEN: readonly Familia[] = ["camaras", "grabacion", "acceso", "alarmas", "red", "servidores", "infraestructura", "otros"];

const ESTADO: Readonly<Record<Tarjeta["estado"], string>> = { ficha: "Ficha leída", manual: "Capturada a mano", falta: "Falta su ficha" };

export default function CatalogoPage() {
  const { token } = useUser();
  const [acceso, setAcceso] = useState<boolean | null>(null);
  const catalogo = useCatalogo(acceso ? token : null);
  const [familia, setFamilia] = useState<Familia | "todo">("todo");
  const [buscar, setBuscar] = useState("");
  const [marca, setMarca] = useState("");
  const [dialogo, setDialogo] = useState<{ fila: FilaCatalogo | null; base: Partial<EquipoParaGuardar> | null } | null>(null);
  const [leyendoFicha, setLeyendoFicha] = useState(false);

  useEffect(() => {
    if (!token) return;
    void consultarAcceso(token)
      .then(setAcceso)
      .catch(() => setAcceso(false));
  }, [token]);

  const tarjetas = useMemo<Tarjeta[]>(() => {
    const filaDe = (id: string) => (id.startsWith("db-") ? (catalogo.filas.find((f) => `db-${f.id}` === id) ?? null) : null);
    const camaras: Tarjeta[] = catalogo.camaras.map((m) => ({
      id: m.id,
      marca: m.marca,
      familia: "camaras",
      tipo: m.tipo,
      etiquetaTipo: ETIQUETA_TIPO_CAMARA[m.tipo],
      nombre: etiquetaModelo(m),
      specs: especificacionesCamara(m),
      foto: m.foto ?? fotoDeTipo(m.tipo),
      estado: m.fuente === "ficha" || m.verificado ? "ficha" : m.fuente === "manual" ? "manual" : "falta",
      fila: filaDe(m.id),
      base: { familia: "camaras", tipo: m.tipo, marca: m.marca, descripcion: m.descripcion, medidas: m.medidas ?? null, datos: { optica: m.optica, wattsPoe: m.wattsPoe ?? null } },
    }));
    const equipos: Tarjeta[] = catalogo.equipos.map((m) => ({
      id: m.id,
      marca: m.marca,
      familia: FAMILIA_DE_TIPO[m.tipo],
      tipo: m.tipo,
      etiquetaTipo: ETIQUETA_TIPO_EQUIPO[m.tipo],
      nombre: etiquetaModelo(m),
      specs: especificacionesEquipo(m),
      foto: m.foto ?? fotoDeTipo(m.tipo),
      estado: m.fuente === "ficha" ? "ficha" : m.fuente === "manual" ? "manual" : "falta",
      fila: filaDe(m.id),
      base: { familia: FAMILIA_DE_TIPO[m.tipo], tipo: m.tipo, marca: m.marca, descripcion: m.descripcion, medidas: m.medidas ?? null, datos: m.datos as Record<string, unknown> },
    }));
    return [...camaras, ...equipos];
  }, [catalogo.camaras, catalogo.equipos, catalogo.filas]);

  const cuenta = useMemo(() => {
    const c = new Map<Familia, number>();
    for (const t of tarjetas) c.set(t.familia, (c.get(t.familia) ?? 0) + 1);
    return c;
  }, [tarjetas]);

  // Sin importar cómo se capturó: «HIKVISION» y «Hikvision» son la misma marca, y «Dahua» y «Dahua Technology».
  const marcas = useMemo(() => {
    const vistas = new Map<string, string>();
    for (const t of tarjetas) if (t.marca.trim() && !vistas.has(claveMarca(t.marca))) vistas.set(claveMarca(t.marca), marcaCorta(t.marca));
    return [...vistas.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [tarjetas]);
  const q = buscar.trim().toLowerCase();
  const visibles = tarjetas.filter((t) => (familia === "todo" || t.familia === familia) && (!marca || claveMarca(t.marca) === marca) && (!q || `${t.nombre} ${t.etiquetaTipo} ${t.specs}`.toLowerCase().includes(q)));

  if (acceso === false) {
    return (
      <div className={styles.sinAcceso}>
        <EmptyState icon={<VideocamOutlinedIcon />} title="El catálogo es para quienes diseñan" description="Lo usan los encargados de área y el arquitecto." tone="neutral" />
      </div>
    );
  }

  return (
    <div className={styles.pagina}>
      <ModulePage
        title="Catálogo de equipos"
        description="Lo que coloques en la maqueta sale de aquí, con su modelo 3D y su ficha."
        breadcrumbs={[{ label: "Clientes y obra" }, { label: "Videovigilancia", href: "/erp/videovigilancia" }, { label: "Catálogo" }]}
        icon={<VideocamOutlinedIcon />}
        secondaryActions={
          <Button iconStart={<AddRoundedIcon />} onClick={() => setDialogo({ fila: null, base: null })}>
            Agregar a mano
          </Button>
        }
        primaryAction={
          <Button variant="primary" iconStart={<UploadFileOutlinedIcon />} onClick={() => setLeyendoFicha(true)}>
            Cargar memoria técnica
          </Button>
        }
      >
        {catalogo.error ? <Alert tone="warning">No se pudo leer lo agregado por tu empresa; se muestra la lista base. {catalogo.error}</Alert> : null}
        <div className={styles.cuerpo}>
          <nav className={styles.familias} aria-label="Familias de equipos">
            <button type="button" aria-pressed={familia === "todo"} onClick={() => setFamilia("todo")}>
              Todo <span>{tarjetas.length}</span>
            </button>
            {ORDEN.filter((f) => cuenta.get(f)).map((f) => (
              <button key={f} type="button" aria-pressed={familia === f} onClick={() => setFamilia(f)}>
                {ETIQUETA_FAMILIA[f]} <span>{cuenta.get(f)}</span>
              </button>
            ))}
          </nav>
          <div className={styles.contenido}>
            <div className={styles.filtros}>
              <Input type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar modelo, marca o tipo" aria-label="Buscar en el catálogo" />
              <select className={styles.marca} value={marca} onChange={(e) => setMarca(e.target.value)} aria-label="Filtrar por marca">
                <option value="">Todas las marcas</option>
                {marcas.map(([clave, nombre]) => (
                  <option key={clave} value={clave}>
                    {nombre}
                  </option>
                ))}
              </select>
            </div>
            {acceso === null || catalogo.cargando ? (
              <Skeleton height={340} />
            ) : (
              <div className={styles.rejilla}>
                {visibles.map((t) => (
                  <button key={t.id} type="button" className={styles.tarjeta} onClick={() => setDialogo(t.fila ? { fila: t.fila, base: null } : { fila: null, base: t.base })} title={t.fila ? "Editar" : "Agregar uno parecido"}>
                    <span className={styles.foto}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={t.foto} alt="" loading="lazy" />
                    </span>
                    <span className={styles.tipo}>{t.etiquetaTipo}</span>
                    <b className={styles.nombre}>{t.nombre}</b>
                    <span className={styles.specs}>{t.specs}</span>
                    <span className={t.estado === "falta" ? styles.estadoFalta : styles.estadoBien}>{ESTADO[t.estado]}</span>
                  </button>
                ))}
                <button type="button" className={styles.agregar} onClick={() => setLeyendoFicha(true)}>
                  <AddRoundedIcon />
                  <b>Agregar equipo</b>
                  <span>Sube su PDF y se llena solo, o captúralo a mano.</span>
                </button>
                {!visibles.length && q ? <p className={styles.vacio}>Sin resultados para «{buscar.trim()}».</p> : null}
              </div>
            )}
          </div>
        </div>
      </ModulePage>
      {dialogo && token ? (
        <DialogoEquipo
          token={token}
          fila={dialogo.fila}
          base={dialogo.base}
          onCerrar={() => setDialogo(null)}
          onGuardado={() => {
            setDialogo(null);
            void catalogo.recargar();
          }}
          onMemoria={() => {
            setDialogo(null);
            setLeyendoFicha(true);
          }}
        />
      ) : null}
      {leyendoFicha && token ? (
        <MemoriaTecnica
          token={token}
          onCerrar={() => setLeyendoFicha(false)}
          onGuardado={() => {
            setLeyendoFicha(false);
            void catalogo.recargar();
          }}
          onManual={() => {
            setLeyendoFicha(false);
            setDialogo({ fila: null, base: null });
          }}
        />
      ) : null}
    </div>
  );
}
