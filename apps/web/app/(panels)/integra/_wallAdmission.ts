import type { PlayerState } from "./_LivePlayer";

/**
 * Control de admisión del muro: **quién puede negociar ahora**.
 *
 * Esto es lo que arregló `8bf4451c` y no se toca a la ligera. El tope no es de
 * cámaras vivas —`cc59543` topaba a 4 vivas y por eso nunca se veían las
 * nueve— sino de *handshakes simultáneos*: con RTT de 87 ms cada apertura RTSP
 * tarda entre 0,7 y 2,5 s, y nueve decodificadores negociando a la vez dejaban
 * media rejilla colgada. En cuanto un mosaico se asienta, entra el siguiente.
 *
 * ## Lo único que cambia respecto a la versión anterior: los que no se ven
 *
 * Medido leyendo el propio reproductor: un mosaico fuera de pantalla se queda
 * en `queued` —su `IntersectionObserver` no lo deja arrancar— pero el bucle de
 * admisión lo contaba como «conectando» porque no estaba asentado. Resultado:
 * un cuadro invisible ocupaba uno de los tres turnos y no lo soltaba hasta que
 * el operador hiciera scroll. En un 4×4 en portátil, donde las dos últimas
 * filas caen bajo el pliegue, eso es exactamente «los que se ven arrancan los
 * últimos».
 *
 * La corrección es la mínima posible: **lo que no se ve no ocupa turno ni se
 * admite**. No consume nada mientras está fuera de pantalla, y cuando entra en
 * el viewport vuelve a la cola normal y respeta el tope como cualquier otro
 * —así que tampoco hay estampida al hacer scroll—.
 */
/**
 * ## Por qué ya no son tres (2026-09-06)
 *
 * El tope de 3 se puso cuando abrir un mosaico costaba caro, y **las tres
 * premisas que lo justificaban han dejado de ser ciertas**, todas medidas:
 *
 * | Entonces | Ahora |
 * |---|---|
 * | El stream se registraba al abrirlo: PUT + saludo RTSP en frío | Precalentado al arrancar la API: go2rtc ya lo conoce |
 * | Fotograma clave cada **3,00 s** — MSE no pinta hasta que llega uno | Cada **0,17 s** (30 fps, `GovLength` 5) |
 * | Ancho de banda del túnel desconocido, y temido | **54,6 Mbps** sostenidos sin pérdida; el muro usa 9,5 |
 *
 * Con dieciséis mosaicos, un tope de 3 son **seis tandas**. A ~0,75 s de
 * arranque en frío cada una, eso es lo que se ve como «tardan demasiado en
 * renderizarse»: no es el video, es la cola.
 *
 * Ocho deja dos tandas. No es un número mágico ni infinito: el riesgo que
 * queda son las cuatro cámaras que van por el grabador —el firmware corta a las
 * pocas sesiones RTSP simultáneas—, y con ocho a la vez como mucho cuatro de
 * ellas coinciden, que es justo el parque entero. Las otras doce van directas a
 * su IP y no comparten ese cuello.
 *
 * Lo que NO cambia: sigue siendo un tope de *handshakes*, no de cámaras vivas.
 * `cc59543` topaba a 4 vivas y por eso nunca se veían las nueve.
 *
 * Si algún día vuelve media rejilla colgada, este número es el primer sospechoso
 * y `_perf.ts` tiene las marcas para medirlo en vez de discutirlo.
 */
export const WALL_CONNECT_CONCURRENCY = 8;

/** Un mosaico que ya no está negociando nada: imagen, respaldo o rendición. */
function asentado(st: PlayerState | undefined): boolean {
  return st === "live" || st === "snapshot" || st === "error";
}

/**
 * Ids admitidos a conectar, recorriendo las celdas en orden.
 *
 * `cells` puede traer huecos (`null`): el muro los conserva para no reordenar
 * la rejilla cuando el operador quita una cámara.
 */
export function admitirMosaicos(
  cells: Array<{ id: string } | null>,
  tileState: Record<string, PlayerState | undefined>,
  concurrency: number = WALL_CONNECT_CONCURRENCY,
): Set<string> {
  const ids = new Set<string>();
  let connecting = 0;
  for (const s of cells) {
    if (!s) continue;
    const st = tileState[s.id];
    // Fuera de pantalla: ni se admite ni ocupa turno. Cuando entre en el
    // viewport pasará a `queued` y competirá por su turno como los demás.
    if (st === "offscreen") continue;
    if (!asentado(st)) {
      if (connecting >= concurrency) continue;
      connecting += 1;
    }
    ids.add(s.id);
  }
  return ids;
}
