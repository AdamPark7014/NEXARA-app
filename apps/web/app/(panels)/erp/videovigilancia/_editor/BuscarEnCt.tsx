"use client";

/**
 * Buscar en el catálogo de CT, de cualquier marca: cámaras, grabadores, acceso, alarmas, switches,
 * servidores o gabinetes. Enseña lo que hay y el precio de venta sugerido; el costo no.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { Alert, Button, Input } from "@/components/base";
import { buscarEnCt, type ResultadoCt } from "@/lib/cctv/api";
import { FAMILIAS_CT, pesos } from "@/lib/cctv/existencias";
import styles from "./existencias.module.css";

export default function BuscarEnCt({
  token,
  titulo,
  accion,
  busquedaInicial = "",
  onElegir,
  onCerrar,
}: {
  token: string;
  titulo: string;
  /** Lo que dice el botón de cada resultado. */
  accion: string;
  busquedaInicial?: string;
  onElegir: (r: ResultadoCt) => void | Promise<void>;
  onCerrar: () => void;
}) {
  const [q, setQ] = useState(busquedaInicial);
  const [familia, setFamilia] = useState("");
  const [resultados, setResultados] = useState<readonly ResultadoCt[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [buscado, setBuscado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eligiendo, setEligiendo] = useState<string | null>(null);
  const ultima = useRef(0);

  useEffect(() => {
    const texto = q.trim();
    if (texto.length < 2 && !familia) {
      setResultados([]);
      setBuscado(false);
      return;
    }
    const n = ++ultima.current;
    const t = setTimeout(() => {
      setBuscando(true);
      setError(null);
      void buscarEnCt(token, texto, familia)
        .then((r) => {
          if (n !== ultima.current) return;
          setResultados(r);
          setBuscado(true);
        })
        .catch((e) => {
          if (n === ultima.current) setError(e instanceof Error ? e.message : "No se pudo buscar.");
        })
        .finally(() => {
          if (n === ultima.current) setBuscando(false);
        });
    }, 260);
    return () => clearTimeout(t);
  }, [q, familia, token]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onCerrar]);

  const elegir = async (r: ResultadoCt) => {
    setEligiendo(r.clave);
    setError(null);
    try {
      await onElegir(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo agregar.");
    } finally {
      setEligiendo(null);
    }
  };

  return createPortal(
    <div className={styles.fondo} role="dialog" aria-modal="true" aria-label={titulo} onClick={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className={styles.hoja}>
        <header className={styles.cabeza}>
          <div>
            <h2>{titulo}</h2>
            <p>Lo que hay hoy en CT, de cualquier marca. El precio es de venta sugerido, sin IVA.</p>
          </div>
          <button type="button" className={styles.cerrar} aria-label="Cerrar" onClick={onCerrar}>
            <CloseRoundedIcon fontSize="small" />
          </button>
        </header>
        <div className={styles.busqueda}>
          <Input type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Modelo o lo que buscas: domo Dahua 5 MP, NVR 8 canales, switch PoE" aria-label="Buscar en CT" />
          <div className={styles.fichas} role="group" aria-label="Familia">
            {FAMILIAS_CT.map(([etiqueta, sub]) => (
              <button key={sub} type="button" aria-pressed={familia === sub} onClick={() => setFamilia((f) => (f === sub ? "" : sub))}>
                {etiqueta}
              </button>
            ))}
          </div>
        </div>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div className={styles.lista} aria-busy={buscando}>
          {resultados.map((r) => (
            <article key={r.clave} className={styles.resultado}>
              <span className={styles.resultadoFoto}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {r.imagen ? <img src={r.imagen} alt="" loading="lazy" referrerPolicy="no-referrer" /> : null}
              </span>
              <div className={styles.resultadoTexto}>
                <b>
                  {r.marca} {r.modelo}
                </b>
                <span>{r.descripcion || r.nombre}</span>
              </div>
              <div className={styles.resultadoDatos}>
                <b>{r.piezas ? `${r.piezas} en CT` : "Sin piezas hoy"}</b>
                <span>{r.precio > 0 ? pesos(r.precio) : "Sin precio"}</span>
              </div>
              <Button size="sm" loading={eligiendo === r.clave} disabled={Boolean(eligiendo)} onClick={() => void elegir(r)}>
                {accion}
              </Button>
            </article>
          ))}
          {!resultados.length && !buscando ? <p className={styles.vacio}>{buscado ? "CT no tiene nada con eso. Prueba con otra palabra o solo el modelo." : "Escribe un modelo o elige una familia."}</p> : null}
          {buscando && !resultados.length ? <p className={styles.vacio}>Buscando…</p> : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
