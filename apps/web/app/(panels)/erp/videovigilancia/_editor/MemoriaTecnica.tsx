"use client";

/**
 * Cargar memoria técnica (mockup aprobado 01-11-2026): se sube el PDF, la IA lee sus datos, cada dato
 * dice de qué hoja salió, la persona corrige lo que haga falta y se ve el modelo 3D armado con esas
 * medidas. Nada se guarda hasta que la persona lo pide, y el PDF no se guarda nunca.
 */
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { createPortal } from "react-dom";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";
import { Alert, Button } from "@/components/base";
import { agregarAlCatalogo, describirEquipo, leerFicha } from "@/lib/cctv/api";
import { ETIQUETA_FAMILIA } from "@/lib/cctv/catalogo";
import {
  ETIQUETA_CAMPO,
  FAMILIAS_FICHA,
  camposDeTipo,
  equipoDesdeForma,
  esCamara,
  etiquetaTipo,
  faltaParaGuardar,
  familiaDe,
  formaDesdeFicha,
  medidasParaVer,
  paramsDeForma,
  type CampoFicha,
  type FichaLeida,
  type FormaFicha,
  type TipoFicha,
} from "@/lib/cctv/ficha";
import { hayWebGL } from "@/lib/cctv/medidas";
import { fotoDeTipo } from "@/lib/cctv/sistema";
import type { RefVisor } from "./VisorModelo";
import styles from "./memoria.module.css";

const VisorModelo = dynamic(() => import("./VisorModelo"), { ssr: false, loading: () => <p className={styles.visorCarga}>Armando el modelo…</p> });

const COLORES: ReadonlyArray<{ id: FormaFicha["color"]; etiqueta: string; fondo: string }> = [
  { id: "negro", etiqueta: "Negro", fondo: "#17191c" },
  { id: "blanco", etiqueta: "Blanco", fondo: "#eceef0" },
  { id: "gris", etiqueta: "Gris", fondo: "#8d939b" },
];

export default function MemoriaTecnica({
  token,
  archivoInicial,
  onCerrar,
  onGuardado,
  onManual,
}: {
  token: string;
  archivoInicial?: File | null;
  onCerrar: () => void;
  /** Recibe el id con el que queda en el catálogo (`db-7`). */
  onGuardado: (id: string) => void;
  /** Para seguir a mano si no se pudo leer. */
  onManual?: () => void;
}) {
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ficha, setFicha] = useState<FichaLeida | null>(null);
  const [forma, setForma] = useState<FormaFicha | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [sinWebGL, setSinWebGL] = useState(() => !hayWebGL());
  const [encima, setEncima] = useState(false);
  const [frase, setFrase] = useState("");
  const entrada = useRef<HTMLInputElement>(null);
  const visor = useRef<RefVisor>(null);

  const leer = async (archivo: File | undefined) => {
    if (!archivo) return;
    setLeyendo(true);
    setError(null);
    setFicha(null);
    setForma(null);
    try {
      const f = await leerFicha(token, archivo);
      setFicha(f);
      setForma(formaDesdeFicha(f));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer ese PDF.");
    } finally {
      setLeyendo(false);
      if (entrada.current) entrada.current.value = "";
    }
  };

  /** Para quien no tiene el PDF a la mano: se revisa en la misma pantalla. */
  const describir = async () => {
    const texto = frase.trim();
    if (!texto || leyendo) return;
    setLeyendo(true);
    setError(null);
    try {
      const f = await describirEquipo(token, texto);
      setFicha(f);
      setForma(formaDesdeFicha(f));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo armar con eso.");
    } finally {
      setLeyendo(false);
    }
  };

  // Lo de atrás no se mueve mientras esta pantalla está abierta.
  useEffect(() => {
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = antes;
    };
  }, []);

  // Una sola vez: el archivo que ya venía de un arrastre.
  const inicial = useRef(archivoInicial);
  useEffect(() => {
    if (inicial.current) void leer(inicial.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      // Con datos a la vista, Esc no los tira.
      if (e.key === "Escape" && !forma && !leyendo) onCerrar();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [forma, leyendo, onCerrar]);

  const alSoltar = (e: DragEvent) => {
    e.preventDefault();
    setEncima(false);
    void leer(e.dataTransfer.files?.[0]);
  };

  const cambiar = (cambios: Partial<FormaFicha>) => setForma((f) => (f ? { ...f, ...cambios } : f));
  const cambiarValor = (campo: CampoFicha, valor: string) => setForma((f) => (f ? { ...f, valores: { ...f.valores, [campo]: valor } } : f));

  const params = useMemo(() => (forma ? paramsDeForma(forma) : {}), [forma]);
  const cotas = useMemo(() => {
    if (!forma) return undefined;
    const valor = (c: CampoFicha) => Number(forma.valores[c]) || null;
    return { anchoMm: valor("anchoMm"), altoMm: valor("altoMm"), fondoMm: valor("fondoMm"), diametroMm: valor("diametroMm") };
  }, [forma]);
  const falta = forma ? faltaParaGuardar(forma) : null;

  const guardar = async () => {
    if (!forma || !ficha || falta || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      const r = await agregarAlCatalogo(token, equipoDesdeForma(forma, { archivo: ficha.archivo, hojas: ficha.hojas }, visor.current?.foto() ?? null));
      onGuardado(`db-${r.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
      setGuardando(false);
    }
  };

  // Va directo al body: dentro del panel, el menú y la barra de Core le quedan encima.
  return createPortal(
    <div className={styles.fondo} role="dialog" aria-modal="true" aria-label="Cargar memoria técnica">
      <input ref={entrada} type="file" accept="application/pdf,.pdf" hidden aria-label="Elegir el PDF" onChange={(e) => void leer(e.target.files?.[0])} />
      <header className={styles.cabeza}>
        <div className={styles.titulo}>
          <h1>Nuevo equipo desde su memoria técnica</h1>
          <span>
            {ficha?.archivo
              ? `${ficha.archivo} · ${ficha.hojas} ${ficha.hojas === 1 ? "hoja" : "hojas"} · leído en ${(ficha.ms / 1000).toFixed(1)} s`
              : ficha
                ? "Armado con lo que escribiste. Solo trae lo que dijiste: complétalo con su ficha."
                : "Sube el PDF del fabricante: la IA llena la ficha y tú la revisas antes de guardar."}
          </span>
        </div>
        {forma ? (
          <>
            <Button iconStart={<UploadFileOutlinedIcon fontSize="small" />} onClick={() => entrada.current?.click()} disabled={guardando}>
              Subir otra ficha
            </Button>
            <Button variant="primary" onClick={() => void guardar()} disabled={Boolean(falta)} loading={guardando} title={falta ?? undefined}>
              Guardar en el catálogo
            </Button>
          </>
        ) : null}
        <Button variant="ghost" icon aria-label="Cerrar" title="Cerrar" onClick={onCerrar} disabled={guardando}>
          <CloseRoundedIcon fontSize="small" />
        </Button>
      </header>

      {error ? (
        <Alert tone="danger" action={onManual && !forma ? <Button size="sm" onClick={onManual}>Capturarlo a mano</Button> : undefined}>
          {error}
        </Alert>
      ) : null}

      {!forma ? (
        <>
        <button
          type="button"
          className={styles.zona}
          data-encima={encima || undefined}
          disabled={leyendo}
          onClick={() => entrada.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setEncima(true);
          }}
          onDragLeave={() => setEncima(false)}
          onDrop={alSoltar}
        >
          {leyendo ? (
            <>
              <span className={styles.giro} aria-hidden="true" />
              <b>Leyendo la memoria técnica…</b>
              <span>Suele tardar unos segundos.</span>
            </>
          ) : (
            <>
              <UploadFileOutlinedIcon />
              <b>Arrastra aquí el PDF o haz clic para elegirlo</b>
              <span>Hasta 30 MB. El PDF no se guarda: solo se usan sus datos.</span>
            </>
          )}
        </button>
        <form
          className={styles.describir}
          onSubmit={(e) => {
            e.preventDefault();
            void describir();
          }}
        >
          <label htmlFor="describir-equipo">¿No tienes el PDF? Descríbelo</label>
          <input id="describir-equipo" value={frase} maxLength={1500} disabled={leyendo} placeholder="Domo Dahua de 5 MP, blanco, lente de 2.8" onChange={(e) => setFrase(e.target.value)} />
          <Button type="submit" disabled={leyendo || frase.trim().length < 3}>
            Armar modelo
          </Button>
        </form>
        </>
      ) : (
        <div className={styles.cuerpo}>
          <section className={styles.datos} aria-label="Datos leídos">
            <div className={styles.datosCabeza}>
              <strong>{ficha?.archivo ? "Lo que leyó la IA" : "Lo que entendió la IA"}</strong>
              <span>{ficha?.archivo ? "Revísalo y corrige lo que haga falta; cada dato dice de qué hoja salió" : "Revísalo y escribe lo que falte"}</span>
            </div>
            {ficha?.escaneado ? <Alert tone="warning">Este PDF no trae texto: se leyó de las imágenes de sus primeras hojas. Revísalo con más cuidado.</Alert> : null}
            <div className={styles.identidad}>
              <label>
                Familia
                <select
                  value={familiaDe(forma.tipo)}
                  onChange={(e) => {
                    const destino = FAMILIAS_FICHA.find((x) => x.id === e.target.value);
                    if (destino) cambiar({ tipo: destino.tipos[0] });
                  }}
                >
                  {FAMILIAS_FICHA.map((x) => (
                    <option key={x.id} value={x.id}>
                      {ETIQUETA_FAMILIA[x.id]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tipo
                <select value={forma.tipo} onChange={(e) => cambiar({ tipo: e.target.value as TipoFicha })}>
                  {(FAMILIAS_FICHA.find((x) => x.id === familiaDe(forma.tipo))?.tipos ?? []).map((t) => (
                    <option key={t} value={t}>
                      {etiquetaTipo(t)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Marca
                <input value={forma.marca} maxLength={80} onChange={(e) => cambiar({ marca: e.target.value })} />
              </label>
              <label>
                Modelo
                <input value={forma.modelo} maxLength={120} onChange={(e) => cambiar({ modelo: e.target.value })} />
              </label>
            </div>
            <div className={styles.filas}>
              {camposDeTipo(forma.tipo, forma.valores).map((campo) => {
                const { etiqueta, unidad } = ETIQUETA_CAMPO[campo];
                const hoja = forma.hojas[campo];
                return (
                  <label key={campo} className={styles.fila}>
                    <span>{etiqueta}</span>
                    <span className={styles.valor}>
                      <input value={forma.valores[campo] ?? ""} placeholder="No viene" onChange={(e) => cambiarValor(campo, e.target.value)} aria-label={etiqueta} />
                      {unidad && forma.valores[campo] ? <i>{unidad}</i> : null}
                    </span>
                    <em>{hoja && (forma.valores[campo] ?? "") !== "" ? `hoja ${hoja}` : ""}</em>
                  </label>
                );
              })}
            </div>
            {falta ? <p className={styles.falta}>{falta}</p> : null}
          </section>

          <section className={styles.modelo} aria-label="Modelo generado">
            <div className={styles.visor}>
              {sinWebGL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fotoDeTipo(forma.tipo)} alt="" className={styles.fotoRespaldo} />
              ) : (
                <VisorModelo ref={visor} tipo={forma.tipo} params={params} cotas={cotas} onSinWebGL={() => setSinWebGL(true)} />
              )}
              <span className={styles.visorEtiqueta}>Modelo armado con sus medidas</span>
              {!sinWebGL ? <span className={styles.visorPista}>Arrastra para girar</span> : null}
            </div>
            <div className={styles.modeloPie}>
              <div className={styles.medidas}>
                {medidasParaVer(forma).map((m) => (
                  <div key={m.etiqueta}>
                    <span>{m.etiqueta}</span>
                    <strong>{m.valor}</strong>
                  </div>
                ))}
              </div>
              {esCamara(forma.tipo) ? (
                <div className={styles.apariencia}>
                  <span>Color</span>
                  {COLORES.map((c) => (
                    <button key={c.id} type="button" aria-label={c.etiqueta} aria-pressed={forma.color === c.id} style={{ background: c.fondo }} onClick={() => cambiar({ color: c.id })} />
                  ))}
                  <span className={styles.separa} />
                  {forma.tipo === "bala" ? (
                    <label className={styles.casilla}>
                      <input type="checkbox" checked={forma.cajaTrasera} onChange={(e) => cambiar({ cajaTrasera: e.target.checked })} />
                      Caja trasera
                    </label>
                  ) : null}
                  {forma.tipo === "domo" ? (
                    <label className={styles.luces}>
                      Luces visibles
                      <input value={forma.luces} inputMode="numeric" onChange={(e) => cambiar({ luces: e.target.value.replace(/\D/g, "").slice(0, 2) })} />
                    </label>
                  ) : null}
                </div>
              ) : null}
              <p className={styles.franco}>Se arma con sus medidas y la forma típica de su tipo: se le parece, pero no es una copia exacta del equipo.</p>
            </div>
          </section>
        </div>
      )}
    </div>,
    document.body,
  );
}
