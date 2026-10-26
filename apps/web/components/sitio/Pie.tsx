import Link from "next/link";
import s from "./pie.module.css";
import base from "./sitio.module.css";
import { ruta } from "./rutas";
import PieAcciones from "./PieAcciones";

const WHATSAPP = "https://wa.me/522226960350?text=Hola%2C%20me%20interesa%20informaci%C3%B3n%20de%20Nexara";

const COLUMNAS: { titulo: string; enlaces: { href: string; label: string; externo?: boolean }[] }[] = [
  {
    titulo: "Servicios",
    enlaces: [
      { href: "/servicios#cctv", label: "Videovigilancia" },
      { href: "/servicios#redes", label: "Redes y Wi‑Fi" },
      { href: "/servicios#computo", label: "Infraestructura y cómputo" },
      { href: "/servicios#soporte", label: "Soporte y gestión TI" },
      { href: "/servicios#software", label: "Plataformas a la medida" },
    ],
  },
  {
    titulo: "Industrias",
    enlaces: [
      { href: "/soluciones/retail", label: "Retail" },
      { href: "/soluciones/manufactura", label: "Manufactura" },
      { href: "/soluciones/hospitalidad", label: "Hospitalidad" },
      { href: "/soluciones/salud", label: "Salud" },
      { href: "/soluciones/educacion", label: "Educación" },
      { href: "/soluciones/gobierno", label: "Gobierno" },
    ],
  },
  {
    titulo: "Cobertura",
    enlaces: [
      { href: "/cobertura/puebla", label: "Puebla" },
      { href: "/cobertura/cdmx", label: "Ciudad de México" },
      { href: "/cobertura/cholula", label: "San Andrés Cholula" },
      { href: "/cobertura/queretaro", label: "Querétaro" },
      { href: "/proyectos", label: "Todo México" },
    ],
  },
  {
    titulo: "NEXARA",
    enlaces: [
      { href: "/nosotros", label: "Nosotros" },
      { href: "/proyectos", label: "Proyectos" },
      { href: "/blog", label: "Blog" },
      { href: "/contacto", label: "Contacto" },
      { href: "/login", label: "Acceso a la plataforma" },
    ],
  },
  {
    titulo: "Contacto",
    enlaces: [
      { href: "tel:+522226960350", label: "+52 222 696 0350" },
      { href: "mailto:gerencia@nexara.com.mx", label: "gerencia@nexara.com.mx" },
      { href: WHATSAPP, label: "WhatsApp", externo: true },
      { href: "https://maps.app.goo.gl/uJBZyNeAApgAri536", label: "Ignacio Allende 512, San Pedro Cholula, Puebla", externo: true },
    ],
  },
];

const REDES = [
  {
    href: "https://www.facebook.com/nexara.mexico/",
    label: "Facebook",
    d: "M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.69.24 2.69.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z",
  },
  {
    href: "https://www.linkedin.com/in/nexara-mx-413717359/",
    label: "LinkedIn",
    d: "M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z",
  },
  {
    href: "https://www.instagram.com/nexara_mx/",
    label: "Instagram",
    d: "M12 2.16c3.2 0 3.58.01 4.85.07 3.25.15 4.77 1.69 4.92 4.92.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.15 3.23-1.66 4.77-4.92 4.92-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-3.26-.15-4.77-1.7-4.92-4.92C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85C2.38 3.92 3.9 2.38 7.15 2.23 8.42 2.17 8.8 2.16 12 2.16zM12 0C8.74 0 8.33.01 7.05.07 2.7.27.27 2.69.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.2 4.36 2.62 6.78 6.98 6.98C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c4.35-.2 6.78-2.62 6.98-6.98.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.2-4.35-2.62-6.78-6.98-6.98C15.67.01 15.26 0 12 0zm0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.41-11.85a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88z",
  },
  {
    href: "https://www.tiktok.com/@nexara_mx",
    label: "TikTok",
    d: "M19.32 5.56a5.1 5.1 0 0 1-3.06-3.83h-3.14v12.16a2.82 2.82 0 1 1-1.95-2.69V8.01a5.95 5.95 0 1 0 5.07 5.89V7.73c.98.39 2.02.6 3.08.61V5.56z",
  },
];

export default function Pie() {
  return (
    <footer className={s.pie}>
      <div className={base.contenedor}>
        <div className={s.arriba}>
          <div>
            <Link href={ruta("/")} className={s.marca} aria-label="NEXARA, inicio">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/nexara-mark-v2.png" alt="" className={s.marcaIso} width={26} height={26} />
              <span className={s.marcaNombre}>NEXARA</span>
            </Link>
            <p className={s.lema}>Videovigilancia, redes, cómputo y soporte TI con un solo responsable.</p>
          </div>
          <div className={s.redes}>
            {REDES.map((r) => (
              <a key={r.label} href={r.href} target="_blank" rel="noopener noreferrer" className={s.red} aria-label={r.label}>
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d={r.d} />
                </svg>
              </a>
            ))}
          </div>
        </div>

        <div className={s.columnas}>
          {COLUMNAS.map((c) => (
            <nav key={c.titulo} aria-label={c.titulo}>
              <h2 className={s.columnaTitulo}>{c.titulo}</h2>
              <ul className={s.lista}>
                {c.enlaces.map((e) => (
                  <li key={e.href}>
                    {e.externo ? (
                      <a href={e.href} target="_blank" rel="noopener noreferrer">
                        {e.label}
                      </a>
                    ) : e.href.startsWith("/") ? (
                      <Link href={ruta(e.href)}>{e.label}</Link>
                    ) : (
                      <a href={e.href}>{e.label}</a>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className={s.abajo}>
          <p>© {new Date().getUTCFullYear()} NEXARA · New Engineering Expertise and Resource Advancement S.A. de C.V.</p>
          <div className={s.legal}>
            <Link href="/legal/privacidad">Privacidad</Link>
            <Link href="/legal/terminos">Términos</Link>
            <Link href="/legal/cookies">Cookies</Link>
            <Link href="/legal/eliminar-cuenta">Eliminar cuenta</Link>
            <PieAcciones className={s.textoBoton} />
          </div>
        </div>
      </div>
    </footer>
  );
}
