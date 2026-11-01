"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import PictureInPictureAltOutlinedIcon from "@mui/icons-material/PictureInPictureAltOutlined";
import CloseIcon from "@mui/icons-material/Close";
import { Button } from "@/components/base";
import OndaVoz from "@/app/(panels)/erp/reuniones/OndaVoz";
import { duracionLegible } from "@/lib/voz-api";
import { useGrabacionActiva, useMotor, type MotorGrabacion } from "./GrabacionProvider";
import s from "./BarraGrabacion.module.css";

/** Concluir pide un segundo toque: no se termina una junta por un clic de paso, sin un cuadro de diálogo. */
function useConfirmarConcluir(concluir: () => void) {
  const [armado, setArmado] = useState(false);
  useEffect(() => {
    if (!armado) return;
    const t = window.setTimeout(() => setArmado(false), 4_000);
    return () => window.clearTimeout(t);
  }, [armado]);
  return {
    etiqueta: armado ? "¿Concluir?" : "Concluir",
    alTocar: () => {
      if (armado) {
        setArmado(false);
        concluir();
      } else setArmado(true);
    },
  };
}

/** Reloj, onda y controles: los mismos en la barra y en la ventanita siempre encima. */
export function ControlesGrabacion({ motor, flotante = false }: { motor: MotorGrabacion; flotante?: boolean }) {
  const { grabadora, concluyendo, sesion, concluir } = motor;
  const enVivo = grabadora.grabando && !grabadora.pausado && !concluyendo;
  const confirmar = useConfirmarConcluir(() => void concluir());
  const etiqueta = concluyendo ? "Concluyendo" : grabadora.pausado ? "En pausa" : "Grabando";
  return (
    <div className={flotante ? s.flotante : s.controles} data-tema-flotante={flotante ? "true" : undefined}>
      <span className={s.punto} data-vivo={enVivo ? "true" : undefined} aria-hidden="true" />
      <div className={s.datos}>
        <strong className={s.reloj} aria-live="off">
          {flotante ? duracionLegible(grabadora.transcurrido) : `${etiqueta} · ${duracionLegible(grabadora.transcurrido)}`}
        </strong>
        <span className={s.titulo}>{sesion.titulo}</span>
      </div>
      {enVivo ? <OndaVoz analizador={grabadora.analizador} activo={enVivo} /> : null}
      {flotante ? null : <AccionesDeBarra />}
      {grabadora.grabando && !concluyendo ? (
        <Button variant="secondary" size="sm" onClick={grabadora.pausado ? grabadora.reanudar : grabadora.pausar}>
          {grabadora.pausado ? "Reanudar" : "Pausar"}
        </Button>
      ) : null}
      <Button variant="danger" size="sm" onClick={confirmar.alTocar} loading={concluyendo} disabled={concluyendo}>
        {confirmar.etiqueta}
      </Button>
    </div>
  );
}

function AccionesDeBarra() {
  const { flotanteDisponible, flotanteAbierta, abrirFlotante } = useGrabacionActiva();
  return (
    <>
      {flotanteDisponible && !flotanteAbierta ? (
        <Button variant="ghost" size="sm" iconStart={<PictureInPictureAltOutlinedIcon />} onClick={() => void abrirFlotante()} title="Abre una ventanita que se queda encima de otras aplicaciones">
          Flotante
        </Button>
      ) : null}
      <Link className={s.enlace} href="/erp/reuniones">
        Ver reunión
      </Link>
    </>
  );
}

/**
 * La barra fija abajo de todos los módulos mientras hay una junta grabándose. En Reuniones no se
 * pinta: ahí está el panel completo. También avisa lo que pasó fuera de esta pestaña: si otra la
 * lleva, si se interrumpió o si ya se concluyó.
 */
export default function BarraGrabacion() {
  const motor = useMotor();
  const pathname = usePathname() ?? "";
  const g = useGrabacionActiva();
  const enReuniones = pathname.startsWith("/erp/reuniones");
  const confirmarRemota = useConfirmarConcluir(() => g.ordenar("concluir"));

  if (motor) {
    if (enReuniones) return null;
    return (
      <div className={s.barra} role="region" aria-label="Grabación de la reunión en curso">
        <ControlesGrabacion motor={motor} />
      </div>
    );
  }
  if (g.otraPestana) {
    const o = g.otraPestana;
    return (
      <div className={s.barra} role="region" aria-label="Grabación en otra pestaña">
        <div className={s.controles}>
          <span className={s.punto} data-vivo={!o.pausado ? "true" : undefined} aria-hidden="true" />
          <div className={s.datos}>
            <strong className={s.reloj}>
              {o.pausado ? "En pausa" : "Grabando"} · {duracionLegible(o.ms)}
            </strong>
            <span className={s.titulo}>{o.titulo} · en otra pestaña</span>
          </div>
          {o.concluyendo ? null : (
            <>
              <Button variant="secondary" size="sm" onClick={() => g.ordenar(o.pausado ? "reanudar" : "pausar")}>
                {o.pausado ? "Reanudar" : "Pausar"}
              </Button>
              <Button variant="danger" size="sm" onClick={confirmarRemota.alTocar}>
                {confirmarRemota.etiqueta}
              </Button>
            </>
          )}
        </div>
      </div>
    );
  }
  if (g.interrumpida) {
    const nota = g.interrumpida;
    return (
      <div className={s.barra} role="status">
        <div className={s.controles}>
          <span className={s.punto} aria-hidden="true" />
          <div className={s.datos}>
            <strong className={s.reloj}>La grabación se interrumpió</strong>
            <span className={s.titulo}>{nota.titulo} · lo grabado está a salvo</span>
          </div>
          <Button variant="primary" size="sm" onClick={() => void g.retomar(nota)}>
            Retomar
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void g.concluirInterrumpida(nota)}>
            Concluir
          </Button>
          <button type="button" className={s.cerrar} aria-label="Cerrar este aviso" onClick={g.olvidarInterrumpida}>
            <CloseIcon aria-hidden />
          </button>
        </div>
      </div>
    );
  }
  if (g.concluida && !enReuniones) {
    return (
      <div className={s.barra} role="status">
        <div className={s.controles}>
          <span className={s.punto} data-listo="true" aria-hidden="true" />
          <div className={s.datos}>
            <strong className={s.reloj}>Reunión concluida</strong>
            <span className={s.titulo}>La minuta se está escribiendo.</span>
          </div>
          <Link className={s.enlace} href={`/erp/reuniones?reunion=${g.concluida}`}>
            Ver minuta
          </Link>
          <button type="button" className={s.cerrar} aria-label="Cerrar este aviso" onClick={g.limpiarConcluida}>
            <CloseIcon aria-hidden />
          </button>
        </div>
      </div>
    );
  }
  return null;
}
