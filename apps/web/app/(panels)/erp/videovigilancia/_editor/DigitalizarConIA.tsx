"use client";

/**
 * «Revisa lo que leyó la IA antes de usarlo» (Ola 5, mockup aprobado el 15-11-2026). Lee el croquis ya
 * subido, muestra encima lo que reconoció (muros, áreas y cámaras numeradas; en naranja lo dudoso) y deja
 * corregir cada cámara, la escala y qué se agrega. Nada entra al plano hasta «Usar en el diseño».
 */
import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/ui/Modal";
import { Alert, Button, Input, Select } from "@/components/base";
import s from "./DigitalizarConIA.module.css";
import { digitalizarCroquis } from "@/lib/cctv/api";
import { ETIQUETA_TIPO_CAMARA, aplicarLectura, resumenLectura, type LecturaPlano, type TipoCamaraLeida } from "@/lib/cctv/digitalizar";
import type { Plano } from "@/lib/cctv/plano";

const TIPOS = Object.keys(ETIQUETA_TIPO_CAMARA) as TipoCamaraLeida[];
export default function DigitalizarConIA({
  abierto,
  token,
  disenoId,
  plano,
  onCerrar,
  onAplicar,
}: {
  abierto: boolean;
  token: string;
  disenoId: number;
  plano: Plano;
  onCerrar: () => void;
  onAplicar: (nuevo: Plano, resumen: string) => void;
}) {
  const croquis = plano.croquis;
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lectura, setLectura] = useState<LecturaPlano | null>(null);
  const [anchoPx, setAnchoPx] = useState(0);
  const [anchoM, setAnchoM] = useState("");
  const [conMuros, setConMuros] = useState(true);
  const [conAreas, setConAreas] = useState(true);
  const [nota, setNota] = useState("");

  async function leer() {
    if (!croquis) return;
    setLeyendo(true);
    setError(null);
    try {
      const r = await digitalizarCroquis(token, disenoId, croquis.url, nota.trim() || undefined);
      setLectura(r.lectura);
      setAnchoPx(r.anchoPx);
      setAnchoM(r.lectura.anchoM ? String(r.lectura.anchoM) : "");
      // Con muros ya dibujados, lo leído se suma: por omisión solo las cámaras.
      const yaTiene = plano.muros.length > 0;
      setConMuros(!yaTiene && r.lectura.muros.length > 0);
      setConAreas(!yaTiene && r.lectura.areas.length > 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "La IA no pudo leer el croquis.");
    } finally {
      setLeyendo(false);
    }
  }

  // Se lee solo al abrir con un croquis nuevo; «Volver a leer» repite.
  useEffect(() => {
    if (abierto && croquis && !lectura && !leyendo && !error) void leer();
    if (!abierto) {
      setLectura(null);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, croquis?.url]);

  const cambiarCamara = (i: number, cambio: Partial<LecturaPlano["camaras"][number]>) =>
    setLectura((l) => (l ? { ...l, camaras: l.camaras.map((c, k) => (k === i ? { ...c, ...cambio, segura: true } : c)) } : l));

  const metros = Number(anchoM.replace(",", "."));
  const usar = () => {
    if (!lectura) return;
    const elegida = { ...lectura, muros: conMuros ? lectura.muros : [], areas: conAreas ? lectura.areas : [] };
    const nuevo = aplicarLectura(plano, elegida, anchoPx, { anchoM: metros > 0 ? metros : null, conMuros, conAreas });
    onAplicar(nuevo, resumenLectura(elegida));
  };

  const ancho = croquis?.anchoPx ?? 1;
  const alto = croquis?.altoPx ?? 1;
  const radio = Math.max(ancho, alto) / 90;
  const dudosas = useMemo(() => (lectura?.camaras ?? []).filter((c) => !c.segura).length, [lectura]);

  return (
    <Modal
      open={abierto}
      onClose={onCerrar}
      title="Revisa lo que leyó la IA antes de usarlo"
      description={lectura ? `Encontró ${resumenLectura(lectura)}. Corrige lo que haga falta: nada entra al plano hasta que lo uses.` : "La IA lee el croquis y propone muros, áreas y cámaras."}
      maxWidth={1180}
      footer={
        <div className={s.pie}>
          <Button variant="ghost" onClick={onCerrar}>
            Ahora no
          </Button>
          {lectura ? (
            <Button variant="secondary" onClick={() => void leer()} loading={leyendo}>
              Volver a leer
            </Button>
          ) : null}
          <Button variant="primary" onClick={usar} disabled={!lectura || leyendo}>
            Usar en el diseño
          </Button>
        </div>
      }
    >
      <div className={s.cuerpo} data-testid="digitalizar-ia">
        <div className={s.colPlano}>
          <div className={s.marco}>
            {croquis ? (
              <svg viewBox={`0 0 ${ancho} ${alto}`} width="100%" role="img" aria-label="Croquis con lo que reconoció la IA">
                <image href={croquis.url} x={0} y={0} width={ancho} height={alto} opacity={0.55} />
                {lectura && conAreas
                  ? lectura.areas.map((a, i) => (
                      <rect
                        key={`a${i}`}
                        className={s.marca}
                        x={a.x}
                        y={a.y}
                        width={a.ancho}
                        height={a.alto}
                        fill="currentColor"
                        fillOpacity={0.06}
                        stroke="currentColor"
                        strokeOpacity={0.35}
                        strokeDasharray={`${radio} ${radio}`}
                        strokeWidth={radio / 4}
                      />
                    ))
                  : null}
                {lectura && conMuros
                  ? lectura.muros.map((m, i) => (
                      <line
                        key={`m${i}`}
                        className={s.muro}
                        x1={m.a.x}
                        y1={m.a.y}
                        x2={m.b.x}
                        y2={m.b.y}
                        stroke="currentColor"
                        strokeWidth={radio / 2.2}
                        strokeLinecap="round"
                      />
                    ))
                  : null}
                {lectura?.camaras.map((c, i) => (
                  <g key={`c${i}`} className={c.segura ? s.marca : s.aviso}>
                    {c.rumboDeg != null ? (
                      <line
                        x1={c.pos.x}
                        y1={c.pos.y}
                        x2={c.pos.x + Math.cos((c.rumboDeg * Math.PI) / 180) * radio * 3}
                        y2={c.pos.y + Math.sin((c.rumboDeg * Math.PI) / 180) * radio * 3}
                        stroke="currentColor"
                        strokeWidth={radio / 3}
                      />
                    ) : null}
                    <circle cx={c.pos.x} cy={c.pos.y} r={radio} fill="currentColor" />
                    <text x={c.pos.x} y={c.pos.y + radio * 0.4} textAnchor="middle" fontSize={radio * 1.1} fill="var(--ui-brand-fg, #fff)" fontWeight={700}>
                      {c.numero}
                    </text>
                  </g>
                ))}
              </svg>
            ) : (
              <p className={s.vacioPlano}>Primero sube el croquis o el plano.</p>
            )}
          </div>
          <div className={s.controles}>
            <label className={s.etiqueta}>
              Ancho real del dibujo (m)
              <Input
                aria-label="Ancho real del dibujo en metros"
                value={anchoM}
                onChange={(e) => setAnchoM(e.target.value)}
                placeholder={lectura?.escalaTexto ?? "p. ej. 32"}
                style={{ width: 88 }}
              />
            </label>
            {lectura?.escalaTexto ? <span className={s.ayuda}>Leyó: {lectura.escalaTexto}</span> : null}
            <label className={s.etiqueta}>
              <input type="checkbox" checked={conMuros} onChange={(e) => setConMuros(e.target.checked)} disabled={!lectura?.muros.length} /> Muros ({lectura?.muros.length ?? 0})
            </label>
            <label className={s.etiqueta}>
              <input type="checkbox" checked={conAreas} onChange={(e) => setConAreas(e.target.checked)} disabled={!lectura?.areas.length} /> Áreas ({lectura?.areas.length ?? 0})
            </label>
          </div>
          {plano.escala.calibracion ? <span className={s.ayuda}>El plano ya está calibrado: se conserva su escala.</span> : null}
        </div>

        <div className={s.colLista}>
          {leyendo ? <Alert tone="info">Leyendo el croquis… suele tardar de 10 a 30 segundos.</Alert> : null}
          {error ? (
            <Alert tone="danger">
              {error}{" "}
              <Button size="sm" variant="ghost" onClick={() => void leer()}>
                Reintentar
              </Button>
            </Alert>
          ) : null}
          {!lectura && !leyendo ? (
            <label className={s.campoNota}>
              Algo que la IA deba saber (opcional)
              <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Las cámaras están marcadas con un triángulo rojo" />
            </label>
          ) : null}
          {lectura ? (
            <>
              <strong className={s.tituloLista}>Cámaras detectadas ({lectura.camaras.length})</strong>
              <div className={s.listaCamaras}>
                {lectura.camaras.map((c, i) => (
                  <div key={i} className={s.filaCamara} data-dudosa={c.segura ? undefined : "true"}>
                    <b className={s.numero} data-dudosa={c.segura ? undefined : "true"}>
                      {c.numero}
                    </b>
                    <Input
                      aria-label={`Ubicación de la cámara ${c.numero}`}
                      value={c.ubicacion}
                      placeholder="Ubicación"
                      onChange={(e) => cambiarCamara(i, { ubicacion: e.target.value })}
                      style={{ flex: "1 1 140px", minWidth: 0 }}
                    />
                    <Select aria-label={`Tipo de la cámara ${c.numero}`} value={c.tipo} onChange={(e) => cambiarCamara(i, { tipo: e.target.value as TipoCamaraLeida })}>
                      {TIPOS.map((t) => (
                        <option key={t} value={t}>
                          {ETIQUETA_TIPO_CAMARA[t]}
                        </option>
                      ))}
                    </Select>
                    <Input
                      aria-label={`Altura de la cámara ${c.numero} en metros`}
                      value={c.alturaM ?? ""}
                      placeholder="Altura m"
                      onChange={(e) => cambiarCamara(i, { alturaM: Number(e.target.value.replace(",", ".")) || null })}
                      style={{ width: 88 }}
                    />
                    <Button size="sm" variant="ghost" aria-label={`Quitar la cámara ${c.numero}`} onClick={() => setLectura((l) => (l ? { ...l, camaras: l.camaras.filter((_, k) => k !== i).map((x, k) => ({ ...x, numero: k + 1 })) } : l))}>
                      Quitar
                    </Button>
                  </div>
                ))}
              </div>
              <span className={s.ayuda}>Cada cámara entra con su cono; el modelo se elige después en el plano.</span>
              {lectura.dudas.length || dudosas ? (
                <div className={s.dudas}>
                  <strong>Lo que la IA no pudo decidir</strong>
                  {dudosas ? <span>{dudosas === 1 ? "1 cámara en aviso" : `${dudosas} cámaras en aviso`}: confirma que sí sean cámaras y su lugar.</span> : null}
                  {lectura.dudas.map((d) => (
                    <span key={d}>{d}</span>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
