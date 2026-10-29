"use client";

/**
 * Panel derecho del editor: lo seleccionado (cámara, muro, hueco, obstáculo, etiqueta, cota o
 * persona), la lista de cámaras y los datos del plano (escala, croquis, alturas en lote y
 * grabación).
 */
import { useMemo, type ReactNode } from "react";
import { Button, Field, Input, Segmented, Select, Switch } from "@/components/base";
import { MODELOS_CAMARA, MODELO_GENERICO, etiquetaModelo, modeloPorId } from "@/lib/cctv/catalogo";
import {
  borrar,
  cambiarAlturaEnLote,
  cambiarModelo,
  duplicarCamara,
  gruposDeAltura,
  actualizarCamara,
  type ResumenDiseno,
  type Seleccion,
} from "@/lib/cctv/editor";
import { ETIQUETA_CODEC, type Codec, type Grabacion } from "@/lib/cctv/infraestructura";
import {
  ANCHO_SENSOR_MM,
  ETIQUETA_NIVEL,
  NIVELES_DORI,
  RESOLUCIONES,
  inclinacionHacia,
  metros,
  resumenOptico,
  type Optica,
} from "@/lib/cctv/optica";
import { distancia, type Abertura, type CamaraPlano, type Plano, type Tapa } from "@/lib/cctv/plano";
import { ETIQUETA_ESTADO_PERSONA, camaraEnMetros, leerPersona } from "@/lib/cctv/visibilidad";
import { ETIQUETA_ESTADO_DISENO, type EstadoDiseno } from "@/lib/cctv/api";
import { COLOR_NIVEL } from "./colores";
import styles from "./editor.module.css";

export type Pestana = "seleccion" | "camaras" | "plano";

type Aplicar = (plano: Plano, opciones?: { seleccion?: Seleccion | null; fusion?: string }) => void;

const num = (v: string): number | null => {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** Campo numérico con unidad que aplica al cambiar (los pasos de una misma tecleada se agrupan). */
function Numero({
  etiqueta,
  valor,
  unidad,
  paso = 0.1,
  min,
  max,
  onCambio,
  pista,
}: {
  etiqueta: string;
  valor: number;
  unidad: string;
  paso?: number;
  min?: number;
  max?: number;
  onCambio: (n: number) => void;
  pista?: ReactNode;
}) {
  return (
    <Field label={etiqueta} hint={pista}>
      <Input
        type="number"
        inputMode="decimal"
        step={paso}
        min={min}
        max={max}
        value={Number.isFinite(valor) ? valor : ""}
        onChange={(e) => {
          const n = num(e.target.value);
          if (n == null) return;
          onCambio(min != null || max != null ? Math.min(Math.max(n, min ?? -Infinity), max ?? Infinity) : n);
        }}
        end={<span className={styles.unidad}>{unidad}</span>}
        controlSize="sm"
      />
    </Field>
  );
}

export default function Inspector({
  plano,
  seleccion,
  pestana,
  onPestana,
  tapas,
  onAplicar,
  onSeleccionar,
  meta,
  onMeta,
  resumen,
  onRecalibrar,
  onCambiarCroquis,
}: {
  plano: Plano;
  seleccion: Seleccion | null;
  pestana: Pestana;
  onPestana: (p: Pestana) => void;
  tapas: readonly Tapa[];
  onAplicar: Aplicar;
  onSeleccionar: (s: Seleccion | null) => void;
  meta: { nombre: string; estado: EstadoDiseno; grabacion: Grabacion };
  onMeta: (m: Partial<{ nombre: string; estado: EstadoDiseno; grabacion: Grabacion }>) => void;
  resumen: ResumenDiseno | null;
  onRecalibrar: () => void;
  onCambiarCroquis: () => void;
}) {
  return (
    <aside className={styles.inspector} aria-label="Panel del plano">
      <div className={styles.pestanas} role="tablist" aria-label="Panel">
        {(
          [
            ["seleccion", seleccion ? etiquetaSeleccion(plano, seleccion) : "Selección"],
            ["camaras", `Cámaras · ${plano.camaras.length}`],
            ["plano", "Plano"],
          ] as const
        ).map(([id, texto]) => (
          <button key={id} type="button" role="tab" aria-selected={pestana === id} className={styles.pestana} onClick={() => onPestana(id)}>
            {texto}
          </button>
        ))}
      </div>
      <div className={styles.inspectorCuerpo}>
        {pestana === "seleccion" ? (
          seleccion ? (
            <PanelSeleccion plano={plano} seleccion={seleccion} tapas={tapas} onAplicar={onAplicar} onSeleccionar={onSeleccionar} />
          ) : (
            <p className={styles.ayuda}>
              Haz clic en una cámara, un muro o un hueco para editarlo. Con <b>+ Cámara</b> pones una nueva; con <b>Persona</b>, un humanoide
              para ver cómo lo capta cada cámara.
            </p>
          )
        ) : pestana === "camaras" ? (
          <ListaCamaras plano={plano} onSeleccionar={(s) => (onSeleccionar(s), onPestana("seleccion"))} />
        ) : (
          <PanelPlano plano={plano} onAplicar={onAplicar} meta={meta} onMeta={onMeta} resumen={resumen} onRecalibrar={onRecalibrar} onCambiarCroquis={onCambiarCroquis} />
        )}
      </div>
    </aside>
  );
}

function etiquetaSeleccion(plano: Plano, s: Seleccion): string {
  if (s.tipo === "camara") {
    const c = plano.camaras.find((x) => x.id === s.id);
    return c ? `Cámara ${c.numero}` : "Cámara";
  }
  const nombres: Record<Seleccion["tipo"], string> = {
    muro: "Muro",
    abertura: "Hueco",
    obstaculo: "Obstáculo",
    etiqueta: "Etiqueta",
    cota: "Cota",
    camara: "Cámara",
    persona: "Persona",
  };
  return nombres[s.tipo];
}

function PanelSeleccion({
  plano,
  seleccion,
  tapas,
  onAplicar,
  onSeleccionar,
}: {
  plano: Plano;
  seleccion: Seleccion;
  tapas: readonly Tapa[];
  onAplicar: Aplicar;
  onSeleccionar: (s: Seleccion | null) => void;
}) {
  const quitar = (texto: string) => (
    <Button variant="danger-ghost" size="sm" onClick={() => onAplicar(borrar(plano, seleccion), { seleccion: null })}>
      {texto}
    </Button>
  );
  switch (seleccion.tipo) {
    case "camara": {
      const c = plano.camaras.find((x) => x.id === seleccion.id);
      return c ? <PanelCamara plano={plano} camara={c} tapas={tapas} onAplicar={onAplicar} quitar={quitar("Quitar cámara")} /> : null;
    }
    case "muro": {
      const m = plano.muros.find((x) => x.id === seleccion.id);
      if (!m) return null;
      const huecos = plano.aberturas.filter((a) => a.muroId === m.id);
      const fusion = `muro-${m.id}`;
      const cambiar = (cambios: Partial<typeof m>) =>
        onAplicar({ ...plano, muros: plano.muros.map((x) => (x.id === m.id ? { ...x, ...cambios } : x)) }, { fusion });
      return (
        <div className={styles.panel}>
          <div className={styles.panelTitulo}>
            <b>Muro</b>
            <span className={styles.tenue}>{metros(distancia(m.a, m.b) * plano.escala.metrosPorPx)} de largo</span>
          </div>
          <div className={styles.dosColumnas}>
            <Numero etiqueta="Altura" valor={m.alturaM} unidad="m" min={0.2} max={30} onCambio={(alturaM) => cambiar({ alturaM })} />
            <Numero etiqueta="Grosor" valor={Math.round(m.grosorM * 100)} unidad="cm" paso={1} min={5} max={100} onCambio={(cm) => cambiar({ grosorM: cm / 100 })} />
          </div>
          <Segmented
            ariaLabel="Tipo de muro"
            value={m.tipo}
            onChange={(tipo) => cambiar({ tipo })}
            items={[
              { id: "muro", label: "Muro" },
              { id: "vidrio", label: "Vidrio", title: "No tapa la vista" },
              { id: "reja", label: "Reja", title: "No tapa la vista" },
            ]}
          />
          <div>
            <p className={styles.seccion}>Huecos en este muro</p>
            {huecos.length ? (
              huecos.map((h) => (
                <button key={h.id} type="button" className={styles.fila} onClick={() => onSeleccionar({ tipo: "abertura", id: h.id })}>
                  <span>{h.tipo === "puerta" ? "Puerta" : h.tipo === "ventana" ? "Ventana" : "Acceso"}</span>
                  <span className={styles.tenue}>
                    {metros((h.hasta - h.desde) * distancia(m.a, m.b) * plano.escala.metrosPorPx)} × {metros(h.alturaM)}
                  </span>
                </button>
              ))
            ) : (
              <p className={styles.ayuda}>Con Puerta, Ventana o Acceso de la barra, haz clic sobre el muro.</p>
            )}
          </div>
          <div className={styles.acciones}>{quitar("Borrar muro")}</div>
        </div>
      );
    }
    case "abertura": {
      const a = plano.aberturas.find((x) => x.id === seleccion.id);
      const m = a ? plano.muros.find((x) => x.id === a.muroId) : undefined;
      return a && m ? <PanelAbertura plano={plano} abertura={a} largoMuroM={distancia(m.a, m.b) * plano.escala.metrosPorPx} alturaMuroM={m.alturaM} onAplicar={onAplicar} quitar={quitar("Quitar hueco")} /> : null;
    }
    case "obstaculo": {
      const o = plano.obstaculos.find((x) => x.id === seleccion.id);
      if (!o) return null;
      const cambiar = (cambios: Partial<typeof o>) =>
        onAplicar({ ...plano, obstaculos: plano.obstaculos.map((x) => (x.id === o.id ? { ...x, ...cambios } : x)) }, { fusion: `ob-${o.id}` });
      return (
        <div className={styles.panel}>
          <Field label="Qué es">
            <Input value={o.nombre ?? ""} onChange={(e) => cambiar({ nombre: e.target.value })} placeholder="Anaquel, columna, rack…" controlSize="sm" />
          </Field>
          <Numero etiqueta="Altura" valor={o.alturaM} unidad="m" min={0.2} max={30} onCambio={(alturaM) => cambiar({ alturaM })} pista="Tapa la vista hasta esa altura." />
          <div className={styles.acciones}>{quitar("Quitar obstáculo")}</div>
        </div>
      );
    }
    case "etiqueta": {
      const e = plano.etiquetas.find((x) => x.id === seleccion.id);
      if (!e) return null;
      return (
        <div className={styles.panel}>
          <Field label="Texto">
            <Input
              value={e.texto}
              onChange={(ev) => onAplicar({ ...plano, etiquetas: plano.etiquetas.map((x) => (x.id === e.id ? { ...x, texto: ev.target.value } : x)) }, { fusion: `et-${e.id}` })}
              controlSize="sm"
            />
          </Field>
          <div className={styles.acciones}>{quitar("Quitar etiqueta")}</div>
        </div>
      );
    }
    case "cota": {
      const c = plano.cotas.find((x) => x.id === seleccion.id);
      if (!c) return null;
      return (
        <div className={styles.panel}>
          <div className={styles.panelTitulo}>
            <b>Cota</b>
            <span className={styles.tenue}>{metros(distancia(c.a, c.b) * plano.escala.metrosPorPx)} con la escala actual</span>
          </div>
          <Field label="Texto">
            <Input value={c.texto ?? ""} onChange={(ev) => onAplicar({ ...plano, cotas: plano.cotas.map((x) => (x.id === c.id ? { ...x, texto: ev.target.value } : x)) }, { fusion: `co-${c.id}` })} controlSize="sm" />
          </Field>
          <div className={styles.acciones}>{quitar("Quitar cota")}</div>
        </div>
      );
    }
    case "persona": {
      const h = plano.personas.find((x) => x.id === seleccion.id);
      if (!h) return null;
      return <PanelPersona plano={plano} pos={h.pos} tapas={tapas} quitar={quitar("Quitar persona")} onSeleccionar={onSeleccionar} />;
    }
  }
}

function PanelCamara({
  plano,
  camara: c,
  tapas,
  onAplicar,
  quitar,
}: {
  plano: Plano;
  camara: CamaraPlano;
  tapas: readonly Tapa[];
  onAplicar: Aplicar;
  quitar: ReactNode;
}) {
  const fusion = `cam-${c.id}`;
  const cambiar = (cambios: Partial<CamaraPlano>) => onAplicar(actualizarCamara(plano, c.id, cambios), { fusion });
  const optica = c.lentes[0]?.optica;
  const cambiarOptica = (cambios: Partial<Optica>) =>
    cambiar({ lentes: c.lentes.map((l, i) => (i === 0 ? { ...l, optica: { ...l.optica, ...cambios } } : l)) });
  const modelo = modeloPorId(c.productoId);
  const ficha = optica ? resumenOptico({ optica, distanciaM: c.distanciaM, alturaCamM: c.alturaM, inclinacionDeg: c.inclinacionDeg }) : null;
  const resolucion = optica ? RESOLUCIONES.find((r) => r.pxHoriz === optica.pxHoriz && r.pxVert === optica.pxVert)?.clave ?? "" : "";

  return (
    <div className={styles.panel}>
      <div className={styles.panelTitulo}>
        <span className={styles.numero}>{c.numero}</span>
        <Input value={c.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} aria-label="Nombre de la cámara" controlSize="sm" />
      </div>
      <Field label="Modelo" hint={modelo && !modelo.verificado ? "Ficha sin verificar contra la hoja técnica." : undefined}>
        <Select
          value={c.productoId ?? ""}
          onChange={(e) => {
            const m = modeloPorId(e.target.value);
            if (m) onAplicar(cambiarModelo(plano, c.id, m));
          }}
          controlSize="sm"
        >
          {!modelo ? <option value={c.productoId ?? ""}>{c.modelo}</option> : null}
          {MODELOS_CAMARA.map((m) => (
            <option key={m.id} value={m.id}>
              {etiquetaModelo(m)}
            </option>
          ))}
          <option value={MODELO_GENERICO.id}>{MODELO_GENERICO.modelo} (óptica a mano)</option>
        </Select>
      </Field>

      <div className={styles.dosColumnas}>
        <Numero etiqueta="Altura de montaje" valor={c.alturaM} unidad="m" min={0.5} max={40} onCambio={(alturaM) => cambiar({ alturaM })} />
        <Numero
          etiqueta="Inclinación"
          valor={c.inclinacionDeg}
          unidad="°"
          paso={1}
          min={-10}
          max={90}
          onCambio={(inclinacionDeg) => cambiar({ inclinacionDeg })}
          pista={
            <button type="button" className={styles.enlace} onClick={() => cambiar({ inclinacionDeg: Math.round(inclinacionHacia(c.alturaM, c.distanciaM * 0.6)) })}>
              Proponer
            </button>
          }
        />
        <Numero etiqueta="Rumbo" valor={c.rumboDeg} unidad="°" paso={1} min={0} max={360} onCambio={(rumboDeg) => cambiar({ rumboDeg: rumboDeg % 360 })} />
        <Numero etiqueta="Largo del cono" valor={c.distanciaM} unidad="m" min={1} max={300} onCambio={(distanciaM) => cambiar({ distanciaM })} />
      </div>
      <Segmented
        ariaLabel="Montaje"
        value={c.montaje ?? "muro"}
        onChange={(montaje) => cambiar({ montaje })}
        items={[
          { id: "muro", label: "Muro" },
          { id: "poste", label: "Poste" },
          { id: "techo", label: "Techo" },
        ]}
      />

      {ficha ? (
        <div>
          <p className={styles.seccion}>Alcance en el piso</p>
          {NIVELES_DORI.filter((n) => n !== "deteccion" || ficha.alcances.deteccion > ficha.alcances.observacion + 0.05).map((n) => (
            <div key={n} className={styles.alcance}>
              <span>
                <span className={styles.punto} style={{ background: COLOR_NIVEL[n] }} />
                {ETIQUETA_NIVEL[n]}
              </span>
              <b title={`Por la visual: ${metros(ficha.alcancesVisual[n])}`}>hasta {metros(ficha.alcances[n])}</b>
              <span className={styles.barraAlcance}>
                <i style={{ width: `${Math.min(100, (ficha.alcances[n] / c.distanciaM) * 100)}%`, background: COLOR_NIVEL[n] }} />
              </span>
            </div>
          ))}
          <dl className={styles.datos}>
            <dt>Zona ciega al pie</dt>
            <dd>{ficha.zonaCiegaM != null ? metros(ficha.zonaCiegaM) : "—"}</dd>
            <dt>Al final del cono</dt>
            <dd>
              {Math.round(ficha.ppmFinal)} PPM · {ETIQUETA_NIVEL[ficha.nivelFinal]}
            </dd>
            <dt>Ángulo horizontal</dt>
            <dd>
              {Math.round(ficha.hfovDeg)}° · {optica?.focalMm} mm{optica?.sensorFormato ? ` · ${optica.sensorFormato}"` : ""}
            </dd>
          </dl>
        </div>
      ) : (
        <p className={styles.avisoPanel}>Falta el sensor o el ángulo de esta lente: captúralo abajo para calcular la cobertura.</p>
      )}

      {optica ? (
        <details className={styles.detalles} open={c.productoId === MODELO_GENERICO.id}>
          <summary>Óptica de la lente</summary>
          <div className={styles.dosColumnas}>
            <Numero etiqueta="Focal" valor={optica.focalMm} unidad="mm" min={0.5} max={500} onCambio={(focalMm) => cambiarOptica({ focalMm })} />
            <Field label="Sensor">
              <Select value={optica.sensorFormato ?? ""} onChange={(e) => cambiarOptica({ sensorFormato: e.target.value || null, sensorAnchoMm: e.target.value ? ANCHO_SENSOR_MM[e.target.value] : optica.sensorAnchoMm })} controlSize="sm">
                <option value="">{optica.sensorAnchoMm ? `${optica.sensorAnchoMm} mm` : "Sin dato"}</option>
                {Object.keys(ANCHO_SENSOR_MM).map((f) => (
                  <option key={f} value={f}>
                    {f}"
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Resolución">
              <Select
                value={resolucion}
                onChange={(e) => {
                  const r = RESOLUCIONES.find((x) => x.clave === e.target.value);
                  if (r) cambiarOptica({ pxHoriz: r.pxHoriz, pxVert: r.pxVert });
                }}
                controlSize="sm"
              >
                {!resolucion ? <option value="">{`${optica.pxHoriz} × ${optica.pxVert}`}</option> : null}
                {RESOLUCIONES.map((r) => (
                  <option key={r.clave} value={r.clave}>
                    {r.etiqueta}
                  </option>
                ))}
              </Select>
            </Field>
            <Numero
              etiqueta="Ángulo declarado"
              valor={optica.hfovDeclaradoDeg ?? NaN}
              unidad="°"
              paso={1}
              min={0}
              max={360}
              onCambio={(n) => cambiarOptica({ hfovDeclaradoDeg: n > 0 ? n : null })}
              pista="Solo si la ficha lo da (ojo de pez, 180°)."
            />
          </div>
        </details>
      ) : null}

      <LecturaCamara plano={plano} camara={c} tapas={tapas} />

      <div className={styles.acciones}>
        <Button
          size="sm"
          onClick={() => {
            const r = duplicarCamara(plano, c.id);
            if (r.camara) onAplicar(r.plano, { seleccion: { tipo: "camara", id: r.camara.id } });
          }}
        >
          Duplicar
        </Button>
        {quitar}
      </div>
    </div>
  );
}

/** Cómo ve esta cámara a cada humanoide en su ángulo. */
function LecturaCamara({ plano, camara, tapas }: { plano: Plano; camara: CamaraPlano; tapas: readonly Tapa[] }) {
  const filas = useMemo(() => {
    const cam = camaraEnMetros(camara, plano.escala);
    if (!cam) return [];
    const k = plano.escala.metrosPorPx;
    return plano.personas
      .map((h) => ({ id: h.id, l: leerPersona(cam, tapas, { x: h.pos.x * k, y: h.pos.y * k }) }))
      .filter((x) => x.l.estado !== "fuera")
      .sort((a, b) => a.l.distanciaPisoM - b.l.distanciaPisoM)
      .slice(0, 5);
  }, [plano, camara, tapas]);
  if (!filas.length) return null;
  return (
    <div>
      <p className={styles.seccion}>Personas en su ángulo</p>
      {filas.map(({ id, l }) => (
        <div key={id} className={styles.alcance}>
          <span>a {metros(l.distanciaPisoM)}</span>
          <b>
            {l.estado === "oculta" ? ETIQUETA_ESTADO_PERSONA.oculta : `${Math.round(l.ppm)} PPM · ${ETIQUETA_NIVEL[l.nivel]}`}
          </b>
        </div>
      ))}
    </div>
  );
}

function PanelAbertura({
  plano,
  abertura: a,
  largoMuroM,
  alturaMuroM,
  onAplicar,
  quitar,
}: {
  plano: Plano;
  abertura: Abertura;
  largoMuroM: number;
  alturaMuroM: number;
  onAplicar: Aplicar;
  quitar: ReactNode;
}) {
  const cambiar = (cambios: Partial<Abertura>) =>
    onAplicar({ ...plano, aberturas: plano.aberturas.map((x) => (x.id === a.id ? { ...x, ...cambios } : x)) }, { fusion: `ab-${a.id}` });
  const anchoM = (a.hasta - a.desde) * largoMuroM;
  const cambiarAncho = (m: number) => {
    const centro = (a.desde + a.hasta) / 2;
    const mitad = Math.min(m / largoMuroM, 1) / 2;
    const desde = Math.max(0, centro - mitad);
    const hasta = Math.min(1, centro + mitad);
    const choca = plano.aberturas.some((o) => o.id !== a.id && o.muroId === a.muroId && o.desde < hasta && o.hasta > desde);
    if (!choca) cambiar({ desde, hasta });
  };
  return (
    <div className={styles.panel}>
      <Segmented
        ariaLabel="Tipo de hueco"
        value={a.tipo}
        onChange={(tipo) => cambiar({ tipo, transparente: tipo === "ventana" ? a.transparente : false })}
        items={[
          { id: "puerta", label: "Puerta" },
          { id: "ventana", label: "Ventana" },
          { id: "acceso", label: "Acceso" },
        ]}
      />
      <div className={styles.dosColumnas}>
        <Numero etiqueta="Ancho" valor={Math.round(anchoM * 100) / 100} unidad="m" min={0.3} max={largoMuroM} onCambio={cambiarAncho} />
        <Numero etiqueta="Altura" valor={a.alturaM} unidad="m" min={0.1} max={alturaMuroM - a.baseM} onCambio={(alturaM) => cambiar({ alturaM })} />
        {a.tipo === "ventana" ? (
          <Numero etiqueta="Antepecho" valor={a.baseM} unidad="m" min={0} max={alturaMuroM - 0.1} onCambio={(baseM) => cambiar({ baseM, alturaM: Math.min(a.alturaM, alturaMuroM - baseM) })} />
        ) : null}
      </div>
      {a.tipo === "puerta" ? (
        <>
          <Switch checked={a.abierta} onChange={(e) => cambiar({ abierta: e.target.checked })} label="Abierta (la hoja no tapa el paso)" />
          <Segmented
            ariaLabel="Hojas"
            value={String(a.hojas) as "1" | "2"}
            onChange={(v) => cambiar({ hojas: v === "2" ? 2 : 1 })}
            items={[
              { id: "1", label: "Una hoja" },
              { id: "2", label: "Dos hojas" },
            ]}
          />
          <div className={styles.acciones}>
            <Button size="sm" onClick={() => cambiar({ sentido: a.sentido === 1 ? -1 : 1 })}>
              Abrir hacia el otro lado
            </Button>
            <Button size="sm" onClick={() => cambiar({ bisagra: a.bisagra === "inicio" ? "fin" : "inicio" })}>
              Cambiar bisagra
            </Button>
          </div>
        </>
      ) : a.tipo === "ventana" ? (
        <Switch checked={a.transparente} onChange={(e) => cambiar({ transparente: e.target.checked })} label="Transparente (se ve a través)" />
      ) : null}
      <div className={styles.acciones}>{quitar}</div>
    </div>
  );
}

function PanelPersona({
  plano,
  pos,
  tapas,
  quitar,
  onSeleccionar,
}: {
  plano: Plano;
  pos: { x: number; y: number };
  tapas: readonly Tapa[];
  quitar: ReactNode;
  onSeleccionar: (s: Seleccion | null) => void;
}) {
  const k = plano.escala.metrosPorPx;
  const filas = plano.camaras
    .map((c) => {
      const cam = camaraEnMetros(c, plano.escala);
      return cam ? { c, l: leerPersona(cam, tapas, { x: pos.x * k, y: pos.y * k }) } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x != null && x.l.estado !== "fuera")
    .sort((a, b) => b.l.ppm - a.l.ppm);
  return (
    <div className={styles.panel}>
      <p className={styles.seccion}>Cómo la ven las cámaras</p>
      {filas.length ? (
        filas.map(({ c, l }) => (
          <button key={c.id} type="button" className={styles.fila} onClick={() => onSeleccionar({ tipo: "camara", id: c.id })}>
            <span>
              <span className={styles.numeroChico}>{c.numero}</span> {c.nombre}
            </span>
            <span className={styles.tenue}>
              {l.estado === "oculta" ? "Oculta por un muro" : `${Math.round(l.ppm)} PPM · ${ETIQUETA_NIVEL[l.nivel]}${l.estado === "parcial" ? " (parcial)" : ""}`}
            </span>
          </button>
        ))
      ) : (
        <p className={styles.ayuda}>Ninguna cámara la tiene en su cuadro. Arrástrala a otra zona.</p>
      )}
      <div className={styles.acciones}>{quitar}</div>
    </div>
  );
}

function ListaCamaras({ plano, onSeleccionar }: { plano: Plano; onSeleccionar: (s: Seleccion) => void }) {
  if (!plano.camaras.length) return <p className={styles.ayuda}>Aún no hay cámaras. Usa «+ Cámara» y haz clic en el plano.</p>;
  return (
    <div className={styles.panel}>
      {[...plano.camaras]
        .sort((a, b) => a.numero - b.numero)
        .map((c) => {
          const o = c.lentes[0]?.optica;
          const f = o ? resumenOptico({ optica: o, distanciaM: c.distanciaM, alturaCamM: c.alturaM, inclinacionDeg: c.inclinacionDeg }) : null;
          return (
            <button key={c.id} type="button" className={styles.fila} onClick={() => onSeleccionar({ tipo: "camara", id: c.id })}>
              <span>
                <span className={styles.numeroChico}>{c.numero}</span> {c.nombre}
                <span className={styles.tenue} style={{ display: "block" }}>
                  {c.modelo}
                </span>
              </span>
              <span className={styles.tenue}>{f ? `${metros(c.distanciaM)} · ${ETIQUETA_NIVEL[f.nivelFinal]}` : "Sin óptica"}</span>
            </button>
          );
        })}
    </div>
  );
}

function PanelPlano({
  plano,
  onAplicar,
  meta,
  onMeta,
  resumen,
  onRecalibrar,
  onCambiarCroquis,
}: {
  plano: Plano;
  onAplicar: Aplicar;
  meta: { nombre: string; estado: EstadoDiseno; grabacion: Grabacion };
  onMeta: (m: Partial<{ nombre: string; estado: EstadoDiseno; grabacion: Grabacion }>) => void;
  resumen: ResumenDiseno | null;
  onRecalibrar: () => void;
  onCambiarCroquis: () => void;
}) {
  const grupos = gruposDeAltura(plano);
  const cal = plano.escala.calibracion;
  return (
    <div className={styles.panel}>
      <Field label="Nombre del diseño">
        <Input value={meta.nombre} onChange={(e) => onMeta({ nombre: e.target.value })} maxLength={160} controlSize="sm" />
      </Field>
      <Field label="Estado">
        <Select value={meta.estado} onChange={(e) => onMeta({ estado: e.target.value as EstadoDiseno })} controlSize="sm">
          {(Object.keys(ETIQUETA_ESTADO_DISENO) as EstadoDiseno[]).map((k) => (
            <option key={k} value={k}>
              {ETIQUETA_ESTADO_DISENO[k]}
            </option>
          ))}
        </Select>
      </Field>

      <div>
        <p className={styles.seccion}>Escala</p>
        <p className={styles.ayuda}>
          {cal ? (
            <>
              Calibrada con una cota de <b>{cal.metros.toFixed(2)} m</b>: 1 px = {(plano.escala.metrosPorPx * 100).toFixed(1)} cm.
            </>
          ) : (
            <>Sin calibrar: las distancias son aproximadas. Marca una cota conocida para fijarla.</>
          )}
        </p>
        <Button size="sm" onClick={onRecalibrar}>
          {cal ? "Recalibrar con otra cota" : "Calibrar con una cota"}
        </Button>
      </div>

      <div>
        <p className={styles.seccion}>Croquis</p>
        {plano.croquis ? (
          <label className={styles.rango}>
            Opacidad
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={plano.croquis.opacidad}
              onChange={(e) => plano.croquis && onAplicar({ ...plano, croquis: { ...plano.croquis, opacidad: Number(e.target.value) } }, { fusion: "opacidad" })}
            />
          </label>
        ) : null}
        <Button size="sm" onClick={onCambiarCroquis}>
          {plano.croquis ? "Cambiar croquis" : "Subir croquis"}
        </Button>
      </div>

      {grupos.length ? (
        <div>
          <p className={styles.seccion}>Altura de muros en lote</p>
          {grupos.map((g) => (
            <div key={g.alturaM} className={styles.alcance}>
              <span>
                {g.muros} {g.muros === 1 ? "muro" : "muros"} de {metros(g.alturaM)}
              </span>
              <Input
                type="number"
                step={0.1}
                min={0.2}
                defaultValue={g.alturaM}
                aria-label={`Nueva altura para los muros de ${g.alturaM} m`}
                onBlur={(e) => {
                  const n = num(e.target.value);
                  if (n != null && n > 0 && Math.abs(n - g.alturaM) > 0.005) onAplicar(cambiarAlturaEnLote(plano, g.alturaM, n));
                }}
                controlSize="sm"
                end={<span className={styles.unidad}>m</span>}
              />
            </div>
          ))}
        </div>
      ) : null}

      <div>
        <p className={styles.seccion}>Grabación</p>
        <div className={styles.dosColumnas}>
          <Numero
            etiqueta="Días guardados"
            valor={meta.grabacion.retencionDias}
            unidad="días"
            paso={1}
            min={1}
            max={365}
            onCambio={(retencionDias) => onMeta({ grabacion: { ...meta.grabacion, retencionDias } })}
          />
          <Field label="Codec">
            <Select value={meta.grabacion.codec} onChange={(e) => onMeta({ grabacion: { ...meta.grabacion, codec: e.target.value as Codec } })} controlSize="sm">
              {(Object.keys(ETIQUETA_CODEC) as Codec[]).map((k) => (
                <option key={k} value={k}>
                  {ETIQUETA_CODEC[k]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {resumen ? (
          <p className={styles.ayuda}>
            {resumen.camaras} cámaras · {Math.round(resumen.mbps)} Mbps · {resumen.tb.toFixed(1)} TB para {meta.grabacion.retencionDias} días.
          </p>
        ) : null}
      </div>
    </div>
  );
}
