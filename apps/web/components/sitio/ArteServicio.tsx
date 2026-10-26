import { foto } from "./fotos";
import { GraficaEntregas, TicketSoporte, TopologiaRed } from "./MiniInterfaces";
import { visualServicio } from "./visuales";

/** Lo que va en el marco del bloque «Qué entregamos»: la mini interfaz del servicio o, si no tiene, su foto. */
export default function ArteServicio({ servicio, alt }: { servicio: string; alt: string }) {
  const v = visualServicio(servicio);
  if (v.arte === "red") return <TopologiaRed />;
  if (v.arte === "soporte") return <TicketSoporte />;
  if (v.arte === "grafica") return <GraficaEntregas />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img {...foto(v.fotoBloque ?? v.foto, "(max-width: 1068px) 100vw, 620px")} alt={alt} loading="lazy" decoding="async" />
  );
}
