/**
 * Home pública del dominio base (`nexara.com.mx/`).
 *
 * El contenido vive en `(public)/nexara/page.tsx` para no duplicar el
 * componente. Aquí simplemente lo re-exportamos de modo que la URL
 * canónica del sitio público sea `/` (sin sufijo `/nexara`) y los
 * crawlers indexen la home en la raíz del dominio.
 *
 * Si entras a `/nexara` directo, el middleware redirige 308 a `/` para
 * mantener una sola URL canónica.
 */
import NexaraHome, { metadata as nexaraMetadata } from "./nexara/page";

export const metadata = nexaraMetadata;

export default NexaraHome;
