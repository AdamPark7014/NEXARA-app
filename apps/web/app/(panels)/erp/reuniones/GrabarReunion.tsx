"use client";

import Button from "@/components/ui/Button";
import InlineAlert from "@/components/ui/InlineAlert";
import { duracionLegible } from "@/lib/voz-api";
import { nombreMicrofono } from "@/lib/microfono";
import { useGrabacionActiva, useMotor } from "@/components/reuniones/GrabacionProvider";
import { AVISO_MS, SILENCIO_MS } from "@/components/reuniones/useMotorGrabacion";
import NotasEnVivo from "./NotasEnVivo";
import OndaVoz from "./OndaVoz";
import TranscripcionEnVivo from "./TranscripcionEnVivo";
import s from "./reuniones.module.css";

/**
 * La junta en curso en la pantalla de Reuniones: «Grabando · 12:34», pausa y «Concluir reunión», el
 * texto y las notas que van apareciendo. La grabación no vive aquí sino en el layout de `/erp`
 * (`GrabacionProvider`): salir de esta pantalla no la corta, y la barra de abajo la sigue mostrando.
 */
export default function GrabarReunion() {
  const motor = useMotor();
  const { flotanteDisponible, flotanteAbierta, abrirFlotante } = useGrabacionActiva();
  if (!motor) return null;
  const {
    sesion,
    estado,
    notas,
    enCola,
    sinRed,
    error,
    concluyendo,
    textos,
    baseTexto,
    grabadora,
    frases,
    dictado,
    vistaPrevia,
    cambiarVistaPrevia,
    escuchar,
    microfonos,
    cambiandoMic,
    cambiarMicrofono,
    concluir,
    descartar,
  } = motor;

  if (!grabadora.soportado) {
    return <InlineAlert variant="warning" message="Este navegador no puede grabar audio. Usa Chrome, Edge o Safari actualizados." />;
  }

  const minutos = Math.floor(grabadora.transcurrido / 60_000);
  const enTexto = estado?.listas ?? 0;
  // Cada parte son 20 s de audio: «6 ya en texto» parecía que solo se grababan esos pedazos (09-11).
  const minutosEnTexto = Math.floor((enTexto * 20) / 60);
  const etiqueta = concluyendo ? "Concluyendo" : grabadora.pausado ? "En pausa" : grabadora.grabando ? "Grabando" : "Detenida";
  const enVivo = grabadora.grabando && !grabadora.pausado && !concluyendo;
  const mudo = enVivo && grabadora.silencioMs >= SILENCIO_MS;
  const previaActiva = escuchar && dictado.escuchando;

  return (
    <section className={s.rec} aria-label="Grabación de la reunión en curso">
      <div className={s.recHead}>
        <div className={s.recStatus}>
          <span
            className={`${s.recDot} ${grabadora.grabando && !grabadora.pausado && !concluyendo ? s.recDotLive : ""}`}
            aria-hidden="true"
          />
          <div style={{ minWidth: 0 }}>
            <p className={s.recLabel} aria-live="polite">
              {etiqueta} · <span className={s.recClock}>{duracionLegible(grabadora.transcurrido)}</span>
            </p>
            <p className={s.recTitle}>{sesion.titulo}</p>
          </div>
          {grabadora.grabando && !concluyendo ? <OndaVoz analizador={grabadora.analizador} activo={enVivo} /> : null}
        </div>
        <div className={s.recActions}>
          {flotanteDisponible && !flotanteAbierta && grabadora.grabando && !concluyendo ? (
            <Button variant="ghost" onClick={() => void abrirFlotante()} title="Abre una ventanita que se queda encima de otras aplicaciones">
              Ventana flotante
            </Button>
          ) : null}
          {grabadora.grabando && !concluyendo ? (
            grabadora.pausado ? (
              <Button variant="secondary" onClick={grabadora.reanudar}>Reanudar</Button>
            ) : (
              <Button variant="secondary" onClick={grabadora.pausar}>Pausar</Button>
            )
          ) : null}
          <Button variant="danger" size="lg" onClick={() => void concluir()} loading={concluyendo} disabled={concluyendo}>
            Concluir reunión
          </Button>
        </div>
      </div>

      <p className={s.recMeta}>
        {concluyendo
          ? enCola
            ? `Subiendo lo último de la grabación (${enCola} ${enCola === 1 ? "parte" : "partes"})…`
            : "Guardando la grabación para escribir la minuta…"
          : `${minutos} ${minutos === 1 ? "minuto grabado completo" : "minutos grabados completos"} · ${minutosEnTexto} ya ${minutosEnTexto === 1 ? "pasó" : "pasaron"} a texto${minutosEnTexto < minutos ? " (lo demás se transcribe solo y entra a la minuta)" : ""} · las notas se toman cada ~4 minutos · sigue grabando aunque cambies de módulo, pestaña o aplicación`}
        {!concluyendo && enCola > 1 ? ` · ${enCola} partes por subir` : ""}
      </p>

      {grabadora.micCaido ? (
        <InlineAlert variant="warning" message="El micrófono se desconectó. Lo estoy reabriendo; lo que ya se grabó está a salvo." />
      ) : null}
      {mudo && !grabadora.micCaido ? (
        <InlineAlert
          variant="warning"
          message={`No te escucho con «${nombreMicrofono(grabadora.microfono?.label)}». Elige otro micrófono o revisa que no esté silenciado.`}
        />
      ) : null}
      {grabadora.grabando && !concluyendo && microfonos.length ? (
        <label className={s.micro}>
          <span className={s.fieldLabel} style={{ margin: 0 }}>Micrófono</span>
          <select
            className={s.input}
            value={grabadora.microfono?.deviceId ?? ""}
            disabled={cambiandoMic}
            onChange={(e) => void cambiarMicrofono(e.target.value)}
            aria-invalid={mudo || undefined}
          >
            {!microfonos.some((m) => m.deviceId === grabadora.microfono?.deviceId) ? (
              <option value={grabadora.microfono?.deviceId ?? ""}>{nombreMicrofono(grabadora.microfono?.label)}</option>
            ) : null}
            {microfonos.map((m) => (
              <option key={m.deviceId} value={m.deviceId}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {sinRed ? (
        <InlineAlert
          variant="warning"
          message={`Sin conexión con el servidor: ${enCola} ${enCola === 1 ? "parte espera" : "partes esperan"} y se suben solas al volver la red. No cierres esta pestaña.`}
        />
      ) : null}
      {grabadora.transcurrido >= AVISO_MS && !concluyendo ? (
        <InlineAlert variant="warning" message="Faltan menos de 10 minutos para el máximo de 3 horas: al llegar, la reunión se concluye sola." />
      ) : null}
      {error || grabadora.error ? <InlineAlert variant="danger" message={(grabadora.error ?? error) as string} /> : null}

      {grabadora.grabando || textos.length ? (
        <TranscripcionEnVivo
          textos={textos}
          base={baseTexto}
          frases={frases}
          parcial={dictado.parcial}
          vistaPrevia={previaActiva}
          pendientes={(estado?.pendientes ?? 0) + enCola}
        />
      ) : null}

      <NotasEnVivo notas={notas} grabando={grabadora.grabando && !concluyendo} />

      {!concluyendo ? (
        <div className={s.recFoot}>
          <div style={{ display: "grid", gap: 6 }}>
            <p className={s.hint} style={{ margin: 0 }}>
              {vistaPrevia && dictado.soportado
                ? "La vista previa usa el reconocimiento de voz de tu navegador; la minuta se hace con el texto de nuestro servidor y el audio se borra en cuanto se transcribe."
                : "La voz se pasa a texto en nuestro servidor y el audio se borra en cuanto se transcribe."}
            </p>
            {dictado.soportado ? (
              <label className={s.interruptor}>
                <input type="checkbox" role="switch" checked={vistaPrevia} onChange={(e) => cambiarVistaPrevia(e.target.checked)} />
                Vista previa del navegador
              </label>
            ) : null}
          </div>
          <Button size="sm" variant="ghost" onClick={descartar}>
            Detener sin concluir
          </Button>
        </div>
      ) : null}
    </section>
  );
}
