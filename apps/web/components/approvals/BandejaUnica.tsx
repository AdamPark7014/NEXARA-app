"use client";

/** Tarjetas de la bandeja única: una por tipo de pendiente, con su botón para resolverlo (15-11). */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useUser } from "@/components/UserContext";
import { cargarBandeja, type GrupoBandeja } from "@/lib/bandeja";
import { decidirBaja, listarBajas, type BajaRequest } from "@/lib/delegated-users-api";
import PedirTexto, { type PedirTextoEstado } from "@/components/ui/PedirTexto";
import InlineAlert from "@/components/ui/InlineAlert";
import Button from "@/components/ui/Button";
import { formatApiError } from "@/lib/erp-api";
import s from "./BandejaUnica.module.css";

export default function BandejaUnica({
  token,
  onGrupos,
  recarga = 0,
}: {
  token: string;
  onGrupos?: (grupos: GrupoBandeja[] | null) => void;
  recarga?: number;
}) {
  const { user } = useUser();
  const puedeDecidirBajas = user?.roleKey === "ceo" || user?.roleKey === "super_admin";
  const [falloCarga, setFalloCarga] = useState(false);
  const [grupos, setGrupos] = useState<GrupoBandeja[] | null>(null);
  const [pendientes, setPendientes] = useState<BajaRequest[]>([]);
  const [vobo, setVobo] = useState<BajaRequest[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pedir, setPedir] = useState<PedirTextoEstado | null>(null);

  useEffect(() => {
    if (!token) return;
    let vivo = true;
    setFalloCarga(false);
    Promise.all([
      cargarBandeja(token, { roleKey: user?.roleKey, isSuperAdmin: Boolean(user?.isSuperAdmin) }),
      puedeDecidirBajas ? listarBajas(token, "PENDIENTE") : Promise.resolve([] as BajaRequest[]),
      puedeDecidirBajas ? listarBajas(token, "APROBADA") : Promise.resolve([] as BajaRequest[]),
    ]).then(([g, pend, apr]) => {
      if (!vivo) return;
      const sinFirmas = g.filter((x) => x.clave !== "firmas" && (puedeDecidirBajas || (x.clave !== "bajas" && x.clave !== "bajasRevisar")));
      setGrupos(sinFirmas);
      onGrupos?.(sinFirmas);
      setPendientes(pend);
      setVobo(apr.filter((x) => x.modo === "APLICADA_CON_VOBO"));
    }).catch((err) => {
      if (!vivo) return;
      setFalloCarga(true);
      setAviso(formatApiError(err, "No se pudo cargar la bandeja."));
    });
    return () => {
      vivo = false;
    };
  }, [token, recarga, tick, puedeDecidirBajas]); // eslint-disable-line react-hooks/exhaustive-deps

  const actuar = async (id: number, accion: "aprobar" | "rechazar" | "revertir") => {
    if (busy !== null) return;
    if (accion === "rechazar") {
      // El motivo se pide en un diálogo de Core; si el servidor lo rechaza, lo escrito no se pierde.
      setAviso(null);
      setPedir({
        titulo: "Rechazar la baja",
        etiqueta: "Motivo del rechazo",
        descripcion: "Quien la pidió verá este motivo.",
        confirmar: "Rechazar",
        minimo: 3,
        peligro: true,
        fn: async (motivo) => {
          await decidirBaja(token, id, "rechazar", motivo);
          setTick((n) => n + 1);
        },
      });
      return;
    }
    setBusy(id);
    setAviso(null);
    try {
      await decidirBaja(token, id, accion);
      setTick((n) => n + 1);
    } catch (err) {
      setAviso(formatApiError(err, "No se pudo completar la acción."));
    } finally {
      setBusy(null);
    }
  };

  if (falloCarga) {
    return (
      <InlineAlert
        variant="danger"
        title="No se pudo cargar lo que espera tu firma"
        message={aviso ?? "No se pudo cargar la bandeja."}
        action={<Button size="sm" variant="secondary" onClick={() => setTick((n) => n + 1)}>Reintentar</Button>}
      />
    );
  }
  if (grupos === null) {
    return (
      <div className={s.rejilla} aria-busy="true" aria-label="Juntando lo que espera tu firma">
        <div className={s.esqueleto} />
        <div className={s.esqueleto} />
      </div>
    );
  }
  if (!grupos.length) return null;

  return (
    <section className={s.rejilla} aria-label="Lo que espera tu firma">
      {aviso ? (
        <div className={s.aviso}>
          <InlineAlert variant="danger" dense message={aviso} onDismiss={() => setAviso(null)} />
        </div>
      ) : null}
      {grupos.map((g) => (
        <article key={g.clave} className={s.tarjeta} data-clave={g.clave}>
          <header className={s.cabeza}>
            <span className={s.cantidad}>{g.cantidad}</span>
            <h3 className={s.titulo}>{g.titulo}</h3>
          </header>
          <p className={s.resumen}>{g.resumen}</p>
          {g.clave === "bajas" && pendientes.length ? (
            <ul className={s.ejemplos}>
              {pendientes.map((b) => (
                <li key={b.id} style={{ display: "grid", gap: 6 }}>
                  <span>{b.user?.nombre || "Persona"}</span>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" className={s.boton} disabled={busy !== null} onClick={() => actuar(b.id, "aprobar")}>
                      Aprobar
                    </button>
                    <button type="button" className={s.boton} disabled={busy === b.id} onClick={() => actuar(b.id, "rechazar")}>
                      Rechazar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : g.clave === "bajasRevisar" && vobo.length ? (
            <ul className={s.ejemplos}>
              {vobo.map((b) => (
                <li key={b.id} style={{ display: "grid", gap: 6 }}>
                  <span>{b.user?.nombre || "Persona"}</span>
                  <button type="button" className={s.boton} disabled={busy === b.id} onClick={() => actuar(b.id, "revertir")}>
                    Revertir
                  </button>
                </li>
              ))}
            </ul>
          ) : g.ejemplos.length ? (
            <ul className={s.ejemplos}>
              {g.ejemplos.map((e, i) => (
                <li key={i}>
                  <span>{e.titulo}</span>
                  {e.detalle ? <small>{e.detalle}</small> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {g.clave !== "bajas" && g.clave !== "bajasRevisar" ? (
            <Link href={g.href} className={s.boton}>
              {g.accion} →
            </Link>
          ) : null}
        </article>
      ))}
      <PedirTexto estado={pedir} onCerrar={() => setPedir(null)} />
    </section>
  );
}
