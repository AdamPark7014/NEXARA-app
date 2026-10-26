import s from "./sitio.module.css";
import Reloj from "./Reloj";

const CAMARAS = [
  { src: "/fotos/control-acceso-torniquetes.jpg", id: "CAM 01", lugar: "Acceso principal", deteccion: { top: "40%", left: "50%", width: "22%", height: "42%" } },
  { src: "/fotos/campo-mastil-antenas.jpg", id: "CAM 02", lugar: "Perímetro norte" },
  { src: "/fotos/control-acceso-terminal-facial.jpg", id: "CAM 03", lugar: "Recepción" },
  { src: "/fotos/monitoreo-sala-videowall.jpg", id: "CAM 04", lugar: "Sala de monitoreo" },
];

/**
 * Ilustración del centro de monitoreo: cámaras en vivo, estado de los sistemas y un
 * ticket de soporte. Es decorativa; el texto del hero dice lo mismo en palabras.
 */
export default function Tablero() {
  return (
    <div className={s.visual} role="img" aria-label="Ilustración del centro de monitoreo de NEXARA con cámaras en vivo y estado de los sistemas">
      <div className={s.ventana} aria-hidden="true">
        <div className={s.ventanaBarra}>
          <span className={s.puntos}>
            <i />
            <i />
            <i />
          </span>
          <span className={s.ventanaTitulo}>Centro de monitoreo</span>
          <span className={s.vivo}>
            <i /> En vivo
          </span>
        </div>
        <div className={s.ventanaCuerpo}>
          <div className={s.camaras}>
            {CAMARAS.map((c, i) => (
              <figure key={c.id} className={s.camara}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.src} alt="" loading="eager" decoding="async" />
                <span className={s.rec}>
                  <i /> REC
                </span>
                {c.deteccion ? (
                  <span className={s.deteccion} style={c.deteccion}>
                    <span>Persona</span>
                  </span>
                ) : null}
                <span className={s.camaraEtiqueta}>
                  {c.id} · {c.lugar}
                </span>
                <span className={s.camaraHora}>
                  <Reloj desfase={i} />
                </span>
              </figure>
            ))}
          </div>
          <ul className={s.estados}>
            <li className={s.estado}>
              Videovigilancia
              <b>Todas en línea</b>
            </li>
            <li className={s.estado}>
              Red y Wi‑Fi
              <b>Estable</b>
              <svg className={s.linea} viewBox="0 0 150 34" preserveAspectRatio="none">
                <path className={s.lineaArea} d="M0 26 L18 22 L34 24 L52 14 L70 18 L88 10 L106 13 L124 6 L150 8 L150 34 L0 34 Z" />
                <path d="M0 26 L18 22 L34 24 L52 14 L70 18 L88 10 L106 13 L124 6 L150 8" />
              </svg>
            </li>
            <li className={s.estado}>
              Respaldos
              <b>Completado</b>
            </li>
            <li className={s.estado}>
              Soporte
              <b>Sin pendientes</b>
            </li>
          </ul>
        </div>
      </div>

      <div className={`${s.flotante} ${s.flotanteTicket}`} aria-hidden="true">
        <strong>Ticket resuelto en sitio</strong>
        Cámara de acceso reconfigurada y probada.
        <span className={s.pasitos}>
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className={s.flotanteFila}>
          <span>Recibido</span>
          <span>Asignado</span>
          <span>En sitio</span>
          <span>Cerrado</span>
        </span>
      </div>

      <div className={`${s.flotante} ${s.flotanteRed}`} aria-hidden="true">
        Próximo mantenimiento
        <strong>Martes 10:00</strong>
      </div>
    </div>
  );
}
