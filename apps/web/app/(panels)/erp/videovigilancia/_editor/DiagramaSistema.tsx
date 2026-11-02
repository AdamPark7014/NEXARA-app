"use client";

/**
 * Diagrama del sistema (mockup aprobado 01-11-2026): de cada equipo al gabinete, con su consumo y su
 * ancho de banda. Sale solo de lo colocado; lo que todavía no se puede calcular se dice, no se inventa.
 * Hoja fija de 1632×1056 px (doble carta), igual que el plano técnico.
 */
import { useMemo, type ReactNode } from "react";
import { ETIQUETA_TIPO_EQUIPO } from "@/lib/cctv/catalogo";
import type { ResumenDiseno } from "@/lib/cctv/editor";
import type { Grabacion } from "@/lib/cctv/infraestructura";
import { claveEquipo } from "@/lib/cctv/medidas";
import { listaNiveles } from "@/lib/cctv/niveles";
import type { EquipoPlano, Plano } from "@/lib/cctv/plano";
import { COLOR_CABLE, ETIQUETA_CABLE, balanceDelSistema, conexionesDelSistema, gruposDeEquipos, revisionDelSistema, type ClaseCable, type GrupoEquipo } from "@/lib/cctv/sistema";
import styles from "./planoTecnico.module.css";

const ANCHO = 1632;
const ALTO = 1056;
const X_IZQ = 44;
const W_NODO = 408;
const X_RACK = 690;
const W_RACK = 300;
const X_DER = 1072;
const W_DER = 516;
const Y_TOPE = 122;
const H_NODO = 58;
const GAP_NODO = 9;
const H_TITULO = 26;

const FAMILIA_A_GRUPO: Readonly<Record<string, { titulo: string; clase: ClaseCable }>> = {
  camaras: { titulo: "Cámaras", clase: "video" },
  acceso: { titulo: "Control de acceso", clase: "acceso" },
  alarmas: { titulo: "Alarmas y sismo", clase: "alarmas" },
};

function compacta(claves: readonly string[]): string {
  if (claves.length < 3) return claves.join(", ");
  return `${claves[0]}…${claves[claves.length - 1].split("-").pop()}`;
}

const wTexto = (w: number) => (w > 0 ? `${w.toFixed(1)} W` : "—");

/** Fotos del rack: un cuadro por equipo, a su altura en U. */
function FilaRack({ e, y, h, x, w }: { e: EquipoPlano; y: number; h: number; x: number; w: number }) {
  const tieneFoto = e.tipo === "nvr" || e.tipo === "switch" || e.tipo === "servidor" || e.tipo === "ups";
  return (
    <g>
      <rect x={x} y={y + 0.5} width={w} height={h - 1} fill="#171a20" />
      {tieneFoto ? <image href={`/cctv/frente/${e.tipo}.webp`} x={x + 30} y={y + 1} width={w - 60} height={h - 2} preserveAspectRatio="xMidYMid meet" /> : null}
      {!tieneFoto ? (
        <text x={x + w / 2} y={y + h / 2 + 4} fontSize={11} fill="#e8eaed" textAnchor="middle">
          {e.nombre}
        </text>
      ) : null}
      <title>{`${claveEquipo(e)} · ${e.nombre}`}</title>
    </g>
  );
}

export default function DiagramaSistema({
  raiz,
  resumen,
  grabacion,
  proyecto,
  version,
  fecha,
}: {
  raiz: Plano;
  resumen: ResumenDiseno | null;
  grabacion: Grabacion;
  proyecto: string;
  version: number;
  fecha: string;
}) {
  const conexiones = useMemo(() => conexionesDelSistema(raiz), [raiz]);
  const grupos = useMemo(() => gruposDeEquipos(raiz, grabacion), [raiz, grabacion]);
  const balance = useMemo(() => balanceDelSistema(raiz, resumen, conexiones), [raiz, resumen, conexiones]);
  const revision = useMemo(() => revisionDelSistema(raiz, resumen, grabacion), [raiz, resumen, grabacion]);
  const equipos = useMemo(() => listaNiveles(raiz).flatMap((n) => n.plano.equipos ?? []), [raiz]);
  const gabinete = equipos.find((e) => e.tipo === "gabinete") ?? null;

  /* ── Izquierda: lo que llega al gabinete, por familia ── */
  const columnas = (Object.keys(FAMILIA_A_GRUPO) as Array<keyof typeof FAMILIA_A_GRUPO>).map((f) => ({ ...FAMILIA_A_GRUPO[f], f, lista: grupos.filter((g) => g.familia === f) })).filter((c) => c.lista.length);
  const nodos: Array<{ g: GrupoEquipo; y: number; clase: ClaseCable }> = [];
  const titulos: Array<{ texto: string; y: number }> = [];
  let y = Y_TOPE;
  const totalNodos = columnas.reduce((s, c) => s + c.lista.length, 0);
  // Si son muchos, se aprietan para que quepan en la hoja.
  const hNodo = Math.min(H_NODO, (ALTO - Y_TOPE - 80 - columnas.length * H_TITULO) / Math.max(totalNodos, 1) - GAP_NODO);
  for (const c of columnas) {
    titulos.push({ texto: c.titulo, y });
    y += H_TITULO;
    for (const g of c.lista) {
      nodos.push({ g, y, clase: c.clase });
      y += hNodo + GAP_NODO;
    }
    y += 6;
  }

  /* ── Centro: el gabinete por unidades ── */
  const unidades = gabinete?.datos.unidades ?? 24;
  const hRack = Math.min(ALTO - Y_TOPE - H_TITULO - 80, 760);
  const yRack = Y_TOPE + H_TITULO;
  const hU = hRack / unidades;
  const dentro = gabinete ? equipos.filter((e) => e.gabineteId === gabinete.id && e.unidad != null) : [];
  const yDeUnidad = (u: number, alto = 1) => yRack + hRack - (u + alto - 1) * hU;
  const yEntrada = (i: number, total: number, clase: ClaseCable) => {
    const base = clase === "video" ? 0.36 : clase === "acceso" ? 0.5 : 0.62;
    return yRack + hRack * base + (i - total / 2) * 6;
  };

  /* ── Derecha: operación y números ── */
  const discos = resumen ? Math.max(1, Math.ceil(resumen.tb / balance.discoTB)) : null;
  const operacion: Array<{ t: string; d: string; v: string; clase?: ClaseCable }> = [
    { t: "Monitor de guardia", d: "Salida del grabador", v: "HDMI" },
    { t: "Red de la empresa", d: "Administración y estaciones de trabajo", v: "1 Gb" },
    { t: "Internet", d: "Acceso remoto por la app y avisos al celular", v: "WAN" },
    { t: "Discos de grabación", d: discos ? `${discos} × ${balance.discoTB} TB en el grabador` : "Falta calcular con las cámaras", v: resumen ? `${resumen.tb.toFixed(1)} TB` : "—" },
  ];
  if (equipos.some((e) => e.tipo === "ups")) operacion.push({ t: "Respaldo de energía", d: "UPS en línea para gabinete y switch", v: "[por calcular]" });
  const H_OP = 62;
  const G_OP = 10;
  const yOp = (i: number) => Y_TOPE + H_TITULO + i * (H_OP + G_OP);
  const yKpi = yOp(operacion.length) + 12;
  const problemas = revision.filter((r) => !r.ok && r.titulo !== "Escala" && r.titulo !== "Plano").slice(0, 3);

  const kpis: Array<{ t: string; v: string; d: string; pct: number | null }> = [
    {
      t: "Consumo PoE",
      v: `${balance.poeW.toFixed(1)} W`,
      d: balance.poeDisponibleW != null ? `de ${balance.poeDisponibleW} W del switch` : "falta el switch",
      pct: balance.poeDisponibleW ? balance.poeW / balance.poeDisponibleW : null,
    },
    {
      t: "Ancho de banda",
      v: `${Math.round(balance.mbps)} Mbps`,
      d: balance.mbpsEntrada != null ? `de ${balance.mbpsEntrada} Mbps de entrada` : "falta el grabador",
      pct: balance.mbpsEntrada ? balance.mbps / balance.mbpsEntrada : null,
    },
    {
      t: `Grabación ${grabacion.retencionDias} días`,
      v: `${balance.tb.toFixed(1)} TB`,
      d: balance.bahias != null ? `de ${balance.bahias * balance.discoTB} TB en discos` : "falta el grabador",
      pct: balance.bahias ? balance.tb / (balance.bahias * balance.discoTB) : null,
    },
  ];

  const lineas: ReactNode[] = [];
  const porClase = new Map<ClaseCable, number>();
  nodos.forEach(({ g, y: yN, clase }, i) => {
    const n = porClase.get(clase) ?? 0;
    porClase.set(clase, n + 1);
    const total = nodos.filter((x) => x.clase === clase).length;
    const yA = yN + hNodo / 2;
    const yB = yEntrada(n, total, clase);
    const xQuiebre = X_IZQ + W_NODO + 40 + (i % 9) * 22;
    lineas.push(
      <polyline key={g.clave} points={`${X_IZQ + W_NODO},${yA} ${xQuiebre},${yA} ${xQuiebre},${yB} ${X_RACK},${yB}`} fill="none" stroke={COLOR_CABLE[clase]} strokeWidth={2} strokeLinejoin="round" />,
      <circle key={`p-${g.clave}`} cx={X_IZQ + W_NODO} cy={yA} r={3} fill={COLOR_CABLE[clase]} />,
    );
  });
  const xDerQuiebre = X_RACK + W_RACK + 34;
  operacion.forEach((_, i) => {
    const yA = yOp(i) + H_OP / 2;
    const yB = yRack + hRack * 0.3 + i * 12;
    lineas.push(<polyline key={`op-${i}`} points={`${X_RACK + W_RACK},${yB} ${xDerQuiebre + i * 8},${yB} ${xDerQuiebre + i * 8},${yA} ${X_DER},${yA}`} fill="none" stroke={COLOR_CABLE.red} strokeWidth={2} strokeLinejoin="round" />);
  });

  return (
    <article className={`${styles.hoja} ${styles.hojaDiagrama} cctv-hoja-plano`} aria-label="Diagrama del sistema">
    <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} width={ANCHO} height={ALTO} role="img" aria-label="Diagrama del sistema">
      <rect width={ANCHO} height={ALTO} fill="#fff" />
      <text x={X_IZQ} y={62} fontSize={28} fontWeight={700} fill="#14181f">
        Diagrama del sistema
      </text>
      <text x={X_IZQ} y={88} fontSize={14} fill="#55606d">
        Cómo se conecta todo: de cada equipo al gabinete, con su consumo y su ancho de banda
      </text>

      {!nodos.length ? (
        <text x={ANCHO / 2} y={ALTO / 2} fontSize={18} fill="#55606d" textAnchor="middle">
          Coloca cámaras y equipos en la maqueta y aquí se arma el diagrama.
        </text>
      ) : null}

      {lineas}

      {titulos.map((t) => (
        <text key={t.texto} x={X_IZQ} y={t.y + 14} fontSize={11.5} fontWeight={700} fill="#3a4450" letterSpacing={1.4}>
          {t.texto.toUpperCase()}
        </text>
      ))}
      {nodos.map(({ g, y: yN }) => (
        <g key={g.clave}>
          <rect x={X_IZQ} y={yN} width={W_NODO} height={hNodo} rx={9} fill="#fff" stroke="#dde1e6" />
          <rect x={X_IZQ + 6} y={yN + 6} width={hNodo + 6} height={hNodo - 12} rx={6} fill="#f1f3f5" />
          <image href={g.foto} x={X_IZQ + 8} y={yN + 7} width={hNodo + 2} height={hNodo - 14} preserveAspectRatio="xMidYMid meet" />
          <text x={X_IZQ + hNodo + 22} y={yN + hNodo / 2 - 3} fontSize={13.5} fontWeight={650} fill="#14181f">
            {g.cantidad} × {g.nombre}
          </text>
          <text x={X_IZQ + hNodo + 22} y={yN + hNodo / 2 + 14} fontSize={11} fill="#55606d">
            {`${g.modelo.replace(/^HIKVISION\s+/i, "").slice(0, 26)} · ${compacta(g.claves)}`}
          </text>
          <text x={X_IZQ + W_NODO - 12} y={yN + hNodo / 2 - 2} fontSize={12.5} fontWeight={650} fill="#14181f" textAnchor="end">
            {wTexto(g.watts)}
          </text>
          {g.mbps > 0 ? (
            <text x={X_IZQ + W_NODO - 12} y={yN + hNodo / 2 + 13} fontSize={10.5} fill="#55606d" textAnchor="end">
              {Math.round(g.mbps)} Mbps
            </text>
          ) : null}
        </g>
      ))}

      <text x={X_RACK} y={Y_TOPE + 14} fontSize={11.5} fontWeight={700} fill="#3a4450" letterSpacing={1.4}>
        {gabinete ? `${claveEquipo(gabinete)} · ${ETIQUETA_TIPO_EQUIPO.gabinete}, ${unidades}U`.toUpperCase() : "GABINETE, POR COLOCAR"}
      </text>
      <rect x={X_RACK} y={yRack - 8} width={W_RACK} height={hRack + 16} rx={8} fill="#1d2026" />
      {Array.from({ length: unidades }, (_, i) => {
        const u = i + 1;
        return (
          <g key={u}>
            <rect x={X_RACK + 34} y={yDeUnidad(u) + 0.5} width={W_RACK - 48} height={hU - 1} fill="#23272e" />
            {hU >= 11 ? (
              <text x={X_RACK + 22} y={yDeUnidad(u) + hU / 2 + 3.5} fontSize={9} fill="#7c8592" textAnchor="middle">
                {u}
              </text>
            ) : null}
          </g>
        );
      })}
      {gabinete ? (
        dentro.map((e) => {
          const alto = Math.max(1, e.datos.unidades ?? 1);
          return <FilaRack key={e.id} e={e} y={yDeUnidad(e.unidad as number, alto)} h={hU * alto} x={X_RACK + 34} w={W_RACK - 48} />;
        })
      ) : (
        <text x={X_RACK + W_RACK / 2} y={yRack + hRack / 2} fontSize={13} fill="#c7cbd1" textAnchor="middle">
          Coloca el gabinete en la maqueta
        </text>
      )}

      <text x={X_DER} y={Y_TOPE + 14} fontSize={11.5} fontWeight={700} fill="#3a4450" letterSpacing={1.4}>
        OPERACIÓN
      </text>
      {operacion.map((o, i) => (
        <g key={o.t}>
          <rect x={X_DER} y={yOp(i)} width={W_DER} height={H_OP} rx={9} fill="#fff" stroke="#dde1e6" />
          <text x={X_DER + 14} y={yOp(i) + 26} fontSize={13.5} fontWeight={650} fill="#14181f">
            {o.t}
          </text>
          <text x={X_DER + 14} y={yOp(i) + 44} fontSize={11} fill="#55606d">
            {o.d}
          </text>
          <text x={X_DER + W_DER - 14} y={yOp(i) + 35} fontSize={12.5} fontWeight={650} fill="#14181f" textAnchor="end">
            {o.v}
          </text>
        </g>
      ))}

      {kpis.map((k, i) => {
        const w = (W_DER - 20) / 3;
        const x = X_DER + i * (w + 10);
        const pct = k.pct == null ? null : Math.min(k.pct, 1);
        const pasa = (k.pct ?? 0) > 1;
        return (
          <g key={k.t}>
            <rect x={x} y={yKpi} width={w} height={108} rx={9} fill="#fff" stroke="#dde1e6" />
            <text x={x + 14} y={yKpi + 24} fontSize={10} fontWeight={700} fill="#55606d" letterSpacing={0.9}>
              {k.t.toUpperCase()}
            </text>
            <text x={x + 14} y={yKpi + 58} fontSize={23} fontWeight={700} fill={pasa ? "#bb2d2d" : "#14181f"}>
              {k.v}
            </text>
            <text x={x + 14} y={yKpi + 78} fontSize={11} fill="#55606d">
              {k.d}
            </text>
            <rect x={x + 14} y={yKpi + 90} width={w - 28} height={5} rx={2.5} fill="#e9ecef" />
            {pct != null ? <rect x={x + 14} y={yKpi + 90} width={(w - 28) * pct} height={5} rx={2.5} fill={pasa ? "#bb2d2d" : "#0f8f7a"} /> : null}
          </g>
        );
      })}

      {problemas.map((r, i) => {
        const yA = yKpi + 120 + i * 58;
        return (
          <g key={r.titulo}>
            <rect x={X_DER} y={yA} width={W_DER} height={50} rx={9} fill="#fbf3e4" stroke="#e8d3a8" />
            <path d={`M${X_DER + 18},${yA + 34} l10,-18 l10,18 Z`} fill="none" stroke="#a96f0e" strokeWidth={1.6} strokeLinejoin="round" />
            <line x1={X_DER + 28} y1={yA + 23} x2={X_DER + 28} y2={yA + 28} stroke="#a96f0e" strokeWidth={1.6} />
            <text x={X_DER + 50} y={yA + 21} fontSize={12.5} fontWeight={650} fill="#14181f">
              {r.titulo}
            </text>
            <foreignObject x={X_DER + 50} y={yA + 25} width={W_DER - 60} height={24}>
              <p className={styles.notaDiagrama}>{r.detalle}</p>
            </foreignObject>
          </g>
        );
      })}

      <g transform={`translate(${X_DER} ${ALTO - 66})`}>
        {(Object.keys(COLOR_CABLE) as ClaseCable[]).map((c, i) => (
          <g key={c} transform={`translate(${i * 130} 0)`}>
            <line x1={0} y1={0} x2={30} y2={0} stroke={COLOR_CABLE[c]} strokeWidth={2.4} />
            <text x={36} y={4} fontSize={11} fill="#3a4450">
              {ETIQUETA_CABLE[c]}
            </text>
          </g>
        ))}
      </g>
      <text x={ANCHO - 44} y={ALTO - 28} fontSize={11} fill="#55606d" textAnchor="end">
        {`${proyecto} · R${Math.max(version - 1, 0)} · ${new Date(fecha).toLocaleDateString("es-MX")}`}
      </text>
    </svg>
    </article>
  );
}
