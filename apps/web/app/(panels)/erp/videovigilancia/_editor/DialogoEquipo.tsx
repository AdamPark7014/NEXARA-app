"use client";

/**
 * Agregar o editar un modelo del catálogo. Pide solo lo que usa ese tipo: lo que da su
 * comportamiento en el diseño y sus medidas para el modelo 3D. Lo que no dice la ficha se deja vacío;
 * el diseñador no inventa datos.
 */
import { useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Alert, Button, Field, Input, Select } from "@/components/base";
import { agregarAlCatalogo, altaEnAlmacen, archivarDelCatalogo, editarCatalogo, type EquipoParaGuardar } from "@/lib/cctv/api";
import { ETIQUETA_TIPO_CAMARA, ETIQUETA_TIPO_EQUIPO, FAMILIA_DE_TIPO, type FilaCatalogo, type TipoCamara, type TipoEquipo } from "@/lib/cctv/catalogo";
import { RESOLUCIONES, pxPorMegapixeles } from "@/lib/cctv/optica";
import { fotoDeTipo } from "@/lib/cctv/sistema";
import { ctDeFila, pesos, type Disponibilidad } from "@/lib/cctv/existencias";
import BuscarEnCt from "./BuscarEnCt";
import estilosStock from "./existencias.module.css";
import styles from "./editor.module.css";

type Tipo = TipoCamara | TipoEquipo;

const GRUPOS: ReadonlyArray<{ etiqueta: string; tipos: ReadonlyArray<[Tipo, string]> }> = [
  { etiqueta: "Cámaras", tipos: (["domo", "turret", "bala", "ptz"] as const).map((t) => [t, ETIQUETA_TIPO_CAMARA[t]]) },
  { etiqueta: "Grabación y red", tipos: (["nvr", "switch", "servidor", "ups", "gabinete"] as const).map((t) => [t, ETIQUETA_TIPO_EQUIPO[t]]) },
  { etiqueta: "Control de acceso", tipos: (["terminal", "barrera"] as const).map((t) => [t, ETIQUETA_TIPO_EQUIPO[t]]) },
  { etiqueta: "Alarmas y sismo", tipos: (["sismica", "sirena", "panel"] as const).map((t) => [t, ETIQUETA_TIPO_EQUIPO[t]]) },
  { etiqueta: "Otros", tipos: [["generico", ETIQUETA_TIPO_EQUIPO.generico]] },
];

const esCamara = (t: Tipo): t is TipoCamara => t in ETIQUETA_TIPO_CAMARA;

type CampoDato = { k: string; etiqueta: string; unidad: string };

const CAMPOS: Partial<Record<TipoEquipo, readonly CampoDato[]>> = {
  nvr: [
    { k: "canales", etiqueta: "Canales", unidad: "" },
    { k: "bahias", etiqueta: "Bahías", unidad: "" },
    { k: "mbpsEntrada", etiqueta: "Entrada", unidad: "Mbps" },
    { k: "unidades", etiqueta: "Ocupa", unidad: "U" },
  ],
  switch: [
    { k: "puertos", etiqueta: "Puertos", unidad: "" },
    { k: "poeTotalW", etiqueta: "PoE total", unidad: "W" },
    { k: "unidades", etiqueta: "Ocupa", unidad: "U" },
  ],
  servidor: [{ k: "unidades", etiqueta: "Ocupa", unidad: "U" }],
  ups: [{ k: "unidades", etiqueta: "Ocupa", unidad: "U" }],
  gabinete: [{ k: "unidades", etiqueta: "Unidades", unidad: "U" }],
  terminal: [{ k: "poeW", etiqueta: "Consumo PoE", unidad: "W" }],
  barrera: [{ k: "plumaM", etiqueta: "Pluma", unidad: "m" }],
  sirena: [{ k: "alcanceM", etiqueta: "Se escucha a", unidad: "m" }],
  sismica: [{ k: "alcanceM", etiqueta: "Se escucha a", unidad: "m" }],
};

function Medida({ etiqueta, unidad, valor, onCambio }: { etiqueta: string; unidad: string; valor: string; onCambio: (v: string) => void }): ReactNode {
  return (
    <Field label={etiqueta}>
      <Input value={valor} onChange={(e) => onCambio(e.target.value)} inputMode="decimal" controlSize="sm" end={unidad ? <span className={styles.unidad}>{unidad}</span> : undefined} />
    </Field>
  );
}

const aTexto = (v: unknown) => (typeof v === "number" ? String(v) : "");
const aNumero = (v: string) => {
  const n = Number(v.replace(",", "."));
  return v.trim() && Number.isFinite(n) && n >= 0 ? n : null;
};

export default function DialogoEquipo({
  token,
  fila,
  base,
  onCerrar,
  onGuardado,
  onMemoria,
  disponibilidad,
  puedeDarDeAlta = false,
  onExistencias,
}: {
  token: string;
  /** Lo que se edita. Sin ella, es un modelo nuevo. */
  fila?: FilaCatalogo | null;
  /** Datos para empezar un modelo nuevo a partir de otro. */
  base?: Partial<EquipoParaGuardar> | null;
  onCerrar: () => void;
  /** Recibe el id con el que queda en el catálogo (`db-7`). */
  onGuardado: (id: string) => void;
  /** Mejor que capturarlo: que la IA lea su PDF. */
  onMemoria?: () => void;
  /** Lo que hay de este modelo, si ya se consultó. */
  disponibilidad?: Disponibilidad | null;
  puedeDarDeAlta?: boolean;
  /** Cambió su liga con Almacén o con CT: hay que volver a preguntar. */
  onExistencias?: () => void;
}) {
  const inicio = fila ?? base ?? null;
  const [tipo, setTipo] = useState<Tipo>((inicio?.tipo as Tipo) ?? "domo");
  const [marca, setMarca] = useState(inicio?.marca ?? "");
  const [modelo, setModelo] = useState(inicio?.modelo ?? "");
  const [descripcion, setDescripcion] = useState(inicio?.descripcion ?? "");
  const datosIniciales = (inicio?.datos ?? {}) as Record<string, unknown>;
  const opticaInicial = (datosIniciales.optica ?? {}) as Record<string, unknown>;
  const [datos, setDatos] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(datosIniciales).map(([k, v]) => [k, aTexto(v)])));
  const [mp, setMp] = useState<number>(() => RESOLUCIONES.find((r) => r.pxHoriz === opticaInicial.pxHoriz && r.pxVert === opticaInicial.pxVert)?.mp ?? 4);
  const [focal, setFocal] = useState(aTexto(opticaInicial.focalMm) || "2.8");
  const [hfov, setHfov] = useState(aTexto(opticaInicial.hfovDeclaradoDeg));
  const [ir, setIr] = useState(aTexto(opticaInicial.irM));
  const [medidas, setMedidas] = useState({ anchoMm: aTexto(inicio?.medidas?.anchoMm), altoMm: aTexto(inicio?.medidas?.altoMm), fondoMm: aTexto(inicio?.medidas?.fondoMm) });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ct, setCt] = useState<string | null>(ctDeFila(fila));
  const [ligando, setLigando] = useState(false);
  const [dandoAlta, setDandoAlta] = useState(false);
  const [altaHecha, setAltaHecha] = useState(false);

  const camara = esCamara(tipo);
  const familia = camara ? "camaras" : FAMILIA_DE_TIPO[tipo];
  const listo = modelo.trim().length > 0 && (!camara || (aNumero(focal) ?? 0) > 0);

  const armar = (): EquipoParaGuardar => {
    const numeros = Object.fromEntries((camara ? [] : (CAMPOS[tipo as TipoEquipo] ?? [])).map((c) => [c.k, aNumero(datos[c.k] ?? "")]));
    // Lo que no se edita aquí (su foto, su apariencia, de qué ficha salió) se conserva.
    const conservar: Record<string, unknown> = Object.fromEntries(Object.entries(datosIniciales).filter(([k]) => k === "foto" || k === "apariencia" || k === "ficha"));
    // La liga con CT vive con su ficha; lo elegido a mano gana sobre lo que coincida por modelo.
    const fichaCon = { ...((conservar.ficha as object | undefined) ?? {}), ct };
    if (ct || conservar.ficha) conservar.ficha = fichaCon;
    const res = pxPorMegapixeles(mp);
    const m = { anchoMm: aNumero(medidas.anchoMm), altoMm: aNumero(medidas.altoMm), fondoMm: aNumero(medidas.fondoMm) };
    const conMedidas = Object.fromEntries(Object.entries(m).filter(([, v]) => v));
    return {
      familia,
      tipo,
      marca: marca.trim(),
      modelo: modelo.trim(),
      descripcion: descripcion.trim(),
      datos: camara
        ? {
            ...conservar,
            optica: { pxHoriz: res?.pxHoriz ?? 2560, pxVert: res?.pxVert ?? 1440, focalMm: aNumero(focal), hfovDeclaradoDeg: aNumero(hfov), irM: aNumero(ir), sensorFormato: '1/3"' },
            wattsPoe: aNumero(datos.wattsPoe ?? ""),
          }
        : { ...conservar, ...numeros },
      medidas: Object.keys(conMedidas).length ? (conMedidas as FilaCatalogo["medidas"]) : null,
      caracteristicas: fila?.caracteristicas ?? [],
      fuente: fila?.fuente ?? "manual",
    };
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!listo || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      const r = fila ? await editarCatalogo(token, fila.id, armar()) : await agregarAlCatalogo(token, armar());
      onGuardado(`db-${r.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
      setGuardando(false);
    }
  };

  const darDeAlta = async () => {
    setDandoAlta(true);
    setError(null);
    try {
      await altaEnAlmacen(token, { marca: marca.trim(), modelo: modelo.trim(), descripcion: descripcion.trim(), categoria: "Videovigilancia", equipoId: fila?.id ?? null });
      setAltaHecha(true);
      onExistencias?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo dar de alta.");
    } finally {
      setDandoAlta(false);
    }
  };

  const archivar = async () => {
    if (!fila) return;
    setGuardando(true);
    try {
      await archivarDelCatalogo(token, fila.id);
      onGuardado(`db-${fila.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo quitar.");
      setGuardando(false);
    }
  };

  return createPortal(
    <div className={styles.modalFondo} onClick={(e) => e.target === e.currentTarget && onCerrar()}>
      <form className={styles.modal} onSubmit={(e) => void enviar(e)} aria-label={fila ? "Editar equipo" : "Agregar equipo"}>
        <header className={styles.modalCabeza}>
          <span className={styles.modalFoto}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fotoDeTipo(tipo)} alt="" />
          </span>
          <div>
            <h2>{fila ? "Editar equipo" : "Agregar equipo"}</h2>
            <p className={styles.tenue}>El tipo decide su modelo 3D y cómo se comporta en el diseño.</p>
          </div>
        </header>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {onMemoria && !fila ? (
          <button type="button" className={styles.equipoAgregar} onClick={onMemoria}>
            <b>¿Tienes su PDF? Súbelo y se llena solo</b>
            <span>La IA lee su memoria técnica; tú la revisas antes de guardar.</span>
          </button>
        ) : null}
        <div className={styles.dosColumnas}>
          <Field label="Tipo">
            <Select value={tipo} onChange={(e) => setTipo(e.target.value as Tipo)} controlSize="sm">
              {GRUPOS.map((g) => (
                <optgroup key={g.etiqueta} label={g.etiqueta}>
                  {g.tipos.map(([t, n]) => (
                    <option key={t} value={t}>
                      {n}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>
          <Field label="Marca">
            <Input value={marca} onChange={(e) => setMarca(e.target.value)} maxLength={80} placeholder="La que sea: Dahua, Axis, ZKTeco…" controlSize="sm" />
          </Field>
        </div>
        <Field label="Modelo">
          <Input value={modelo} onChange={(e) => setModelo(e.target.value)} maxLength={120} placeholder="Ej. DS-2CD2143G2-I" autoFocus controlSize="sm" />
        </Field>
        <Field label="Descripción" hint="Una línea: se lee en el panel y en la propuesta.">
          <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={300} controlSize="sm" />
        </Field>

        {camara ? (
          <>
            <p className={styles.seccion}>De su ficha</p>
            <div className={styles.dosColumnas}>
              <Field label="Resolución">
                <Select value={String(mp)} onChange={(e) => setMp(Number(e.target.value))} controlSize="sm">
                  {RESOLUCIONES.map((r) => (
                    <option key={r.clave} value={r.mp}>
                      {r.etiqueta}
                    </option>
                  ))}
                </Select>
              </Field>
              <Medida etiqueta="Lente" unidad="mm" valor={focal} onCambio={setFocal} />
              <Medida etiqueta="Ángulo horizontal" unidad="°" valor={hfov} onCambio={setHfov} />
              <Medida etiqueta="IR" unidad="m" valor={ir} onCambio={setIr} />
              <Medida etiqueta="Consumo" unidad="W" valor={datos.wattsPoe ?? ""} onCambio={(v) => setDatos((d) => ({ ...d, wattsPoe: v }))} />
            </div>
          </>
        ) : CAMPOS[tipo as TipoEquipo]?.length ? (
          <>
            <p className={styles.seccion}>De su ficha</p>
            <div className={styles.dosColumnas}>
              {(CAMPOS[tipo as TipoEquipo] ?? []).map((c) => (
                <Medida key={c.k} etiqueta={c.etiqueta} unidad={c.unidad} valor={datos[c.k] ?? ""} onCambio={(v) => setDatos((d) => ({ ...d, [c.k]: v }))} />
              ))}
            </div>
          </>
        ) : null}

        <p className={styles.seccion}>Medidas, para que el modelo 3D salga a escala</p>
        <div className={styles.tresColumnas}>
          <Medida etiqueta="Ancho" unidad="mm" valor={medidas.anchoMm} onCambio={(v) => setMedidas((m) => ({ ...m, anchoMm: v }))} />
          <Medida etiqueta="Alto" unidad="mm" valor={medidas.altoMm} onCambio={(v) => setMedidas((m) => ({ ...m, altoMm: v }))} />
          <Medida etiqueta="Fondo" unidad="mm" valor={medidas.fondoMm} onCambio={(v) => setMedidas((m) => ({ ...m, fondoMm: v }))} />
        </div>

        {fila || disponibilidad ? (
          <div className={estilosStock.existencias} aria-label="Existencias">
            <div className={estilosStock.existenciasFila}>
              <span>
                <b>Almacén:</b> {disponibilidad?.almacen || altaHecha ? `${disponibilidad?.almacen?.piezas ?? 0} piezas` : "sin dar de alta"}
                {disponibilidad?.almacen || altaHecha ? <small>Las entradas se registran en Almacén.</small> : null}
              </span>
              {!disponibilidad?.almacen && !altaHecha && puedeDarDeAlta && modelo.trim() ? (
                <Button type="button" size="sm" loading={dandoAlta} onClick={() => void darDeAlta()}>
                  Dar de alta en Almacén
                </Button>
              ) : null}
            </div>
            <div className={estilosStock.existenciasFila}>
              <span>
                <b>CT:</b>{" "}
                {disponibilidad?.ct ? `${disponibilidad.ct.piezas} piezas · ${disponibilidad.ct.precio > 0 ? `${pesos(disponibilidad.ct.precio)} sin IVA` : "sin precio"}` : ct ? `ligado a ${ct}` : "no lo encontré con este modelo"}
                {disponibilidad?.ct ? <small>Clave {disponibilidad.ct.clave}{disponibilidad.ct.ligado === "manual" ? ", elegida a mano" : ", coincide por modelo"}</small> : null}
              </span>
              {fila ? (
                <Button type="button" size="sm" onClick={() => setLigando(true)}>
                  {ct || disponibilidad?.ct ? "Cambiar" : "Buscar en CT"}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className={styles.acciones}>
          <Button type="submit" variant="primary" disabled={!listo} loading={guardando}>
            {fila ? "Guardar" : "Agregar al catálogo"}
          </Button>
          <Button type="button" variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          {fila ? (
            <Button type="button" variant="danger-ghost" onClick={() => void archivar()} disabled={guardando}>
              Quitar del catálogo
            </Button>
          ) : null}
        </div>
      </form>
      {ligando ? (
        <BuscarEnCt
          token={token}
          titulo={`Ligar ${modelo.trim() || "este equipo"} con CT`}
          accion="Ligar"
          busquedaInicial={modelo.trim()}
          onCerrar={() => setLigando(false)}
          onElegir={(r) => {
            setCt(r.clave);
            setLigando(false);
          }}
        />
      ) : null}
    </div>,
    document.body,
  );
}
