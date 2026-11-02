"use client";

/** Ficha › Resumen: a dónde se va cada kilómetro, gasolina, desgaste, próximo servicio y últimos viajes. */

import Link from "next/link";
import { pesos, pesos2 } from "@/lib/costos";
import {
  fechaCorta,
  fechaLarga,
  km,
  kmPorLitro,
  pctDeDesglose,
  type FichaVehiculo,
} from "@/lib/vehiculos-ficha";
import { Barra, Medidor, Pastilla, c, v } from "./piezas";

const ETIQUETA_DESTINO = { PROYECTO: "Proyecto", COTIZACION: "Cotización", OFICINA: "Oficina", SIN_LIGAR: "Sin ligar" };

export default function ResumenVehiculo({ ficha, estado }: { ficha: FichaVehiculo; estado?: React.ReactNode }) {
  const { costos, desgaste, proximoServicio: proximo, rendimiento, tanques } = ficha;
  return (
    <>
      <div className={v.columnas}>
        <div className={v.principal}>
          {costos ? <CadaKilometro costos={costos} rendimiento={rendimiento.usado} /> : null}
          <Gasolina tanques={tanques} rendimiento={rendimiento} />
        </div>

        <aside className={v.lateral}>
          {estado}
          <section className={c.card}>
            <h2 className={v.titulo}>Desgaste</h2>
            {desgaste.vida.totalKm ? (
              <Medidor
                nombre="Vida del vehículo"
                pct={desgaste.vida.pct}
                nota={`${km(desgaste.vida.km).replace(" km", "")} de ${km(desgaste.vida.totalKm)}`}
              />
            ) : (
              <p className={c.hint}>Con su ficha de costo sale cuánta vida le queda.</p>
            )}
            {desgaste.llantas.pct != null ? (
              <Medidor nombre="Llantas" pct={desgaste.llantas.pct} nota={`Quedan ${km(desgaste.llantas.quedanKm)}`} />
            ) : null}
            {desgaste.aceite.ultimoKm != null ? (
              <Medidor nombre="Aceite" pct={desgaste.aceite.pct} nota={`Cambiado a los ${km(desgaste.aceite.ultimoKm)}`} />
            ) : null}
            {costos ? (
              <div className={v.datoFila}>
                <span>Valor estimado hoy</span>
                <b className={v.num}>{pesos(costos.valorEstimado)}</b>
              </div>
            ) : null}
          </section>

          <section className={c.card}>
            <h2 className={v.titulo}>Próximo servicio</h2>
            {proximo ? (
              <>
                <div className={v.cifra} style={{ marginTop: 4 }}>
                  {proximo.km != null ? `A los ${km(proximo.km)}` : fechaCorta(proximo.fecha)}
                </div>
                <p className={c.hint} style={{ marginTop: 2 }}>
                  {proximo.faltanKm != null
                    ? proximo.faltanKm < 0
                      ? `Se pasó por ${km(-proximo.faltanKm)}`
                      : `Faltan ${km(proximo.faltanKm)}`
                    : null}
                  {proximo.faltanKm != null && proximo.fecha ? ", o " : ""}
                  {proximo.fecha ? `el ${fechaLarga(proximo.fecha)}` : ""}
                  {proximo.faltanKm != null && proximo.fecha ? ", lo que llegue primero." : "."}
                </p>
                <div className={v.datoFila}>
                  <span style={{ color: "inherit" }}>{proximo.conceptos.join(", ")}.</span>
                </div>
              </>
            ) : (
              <p className={c.hint}>Sin programa: se llena con el manual.</p>
            )}
            {costos ? (
              <p className={c.hint}>
                La tarifa ya apartó {pesos(costos.mantenimiento.apartado)} para mantenimiento y van {pesos(costos.mantenimiento.gastado)} gastados.
                Con los años, el coeficiente se corrige con lo real.
              </p>
            ) : null}
          </section>
        </aside>
      </div>

      <section className={c.card}>
        <h2 className={v.titulo}>Últimos viajes</h2>
        {ficha.viajes.length ? (
          <div className={v.tablaCaja}>
            <table className={v.tabla}>
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Trabajo</th>
                  <th scope="col">Se carga a</th>
                  <th scope="col" className={v.der}>
                    Km
                  </th>
                  {ficha.acceso.veCostos ? (
                    <th scope="col" className={v.der}>
                      Costo
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {ficha.viajes.slice(0, 8).map((t) => (
                  <tr key={t.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{fechaCorta(t.fecha)}</td>
                    <td>
                      {t.actividad ? (
                        <Link className={v.enlace} href={`/erp/actividades/${t.actividad.id}`}>
                          {t.actividad.titulo}
                        </Link>
                      ) : (
                        "—"
                      )}
                      {t.destino.nombre ? <span className={v.celdaSub}>{t.destino.nombre}</span> : null}
                    </td>
                    <td>
                      <Pastilla tono={t.destino.tipo}>{ETIQUETA_DESTINO[t.destino.tipo]}</Pastilla>
                    </td>
                    <td className={v.der}>{t.km.toLocaleString("es-MX")}</td>
                    {ficha.acceso.veCostos ? <td className={v.der}>{pesos(t.importe)}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={c.hint}>
            Sin salidas registradas todavía. Los kilómetros nacen cuando alguien registra la salida y el regreso con la foto del tablero, en Mis vehículos.
          </p>
        )}
      </section>
    </>
  );
}

function CadaKilometro({ costos, rendimiento }: { costos: NonNullable<FichaVehiculo["costos"]>; rendimiento: number | null }) {
  const pcts = pctDeDesglose(costos.desglose);
  const notas: Record<string, string> = {
    co: `${pesos2(costos.precioLitro)} entre ${kmPorLitro(rendimiento)}, de tus tickets`,
    d: `Lo que pierde de valor en ${km(costos.ficha.vidaKm)}`,
    im: `Lo que costaría ese dinero al ${Math.round(costos.ficha.tasaInteres * 100)} % anual`,
    mn: "Servicios y reparaciones",
    sm: "Prima anual repartida entre los km del año",
    n: `${pesos(costos.ficha.valorLlantas)} entre ${km(costos.ficha.vidaLlantasKm)}`,
    lb: `${pesos(costos.ficha.costoAceite)} cada ${km(costos.ficha.aceiteCadaKm)}`,
    otros: "Lo anual repartido entre los km del año",
  };
  return (
    <section className={c.card}>
      <h2 className={v.titulo} style={{ marginBottom: 10 }}>
        A dónde se va cada kilómetro
      </h2>
      <Barra
        etiqueta={`De ${pesos2(costos.porKm)} por kilómetro: ${costos.desglose.map((p, i) => `${pcts[i]} por ciento ${p.nombre}`).join(", ")}`}
        partes={costos.desglose.map((p, i) => ({ tono: p.clave, pct: pcts[i] }))}
      />
      {costos.desglose.map((p, i) => (
        <div className={v.renglon} key={p.clave}>
          <span className={v.punto} data-tono={p.clave} aria-hidden="true" />
          <div className={v.renglonTexto}>
            <b>{p.nombre}</b>
            <span>{notas[p.clave]}</span>
          </div>
          <span className={v.renglonDato}>{pcts[i]} %</span>
          <span className={v.renglonImporte}>{pesos2(p.importe)}</span>
        </div>
      ))}
      <div className={v.total}>
        <span>Por kilómetro</span>
        <span>{pesos2(costos.porKm)}</span>
      </div>
    </section>
  );
}

function Gasolina({ tanques, rendimiento }: { tanques: FichaVehiculo["tanques"]; rendimiento: FichaVehiculo["rendimiento"] }) {
  const { oficial, real } = rendimiento;
  const brecha = oficial && real ? Math.round((1 - real / oficial) * 100) : null;
  const tope = Math.max(oficial ?? 0, ...tanques.map((t) => t.kmPorLitro), 1) * 1.1;
  const alto = (x: number) => Math.round((x / tope) * 120);
  return (
    <section className={c.card}>
      <div className={v.cabecera} style={{ marginBottom: 4 }}>
        <h2 className={v.titulo}>Gasolina: lo oficial contra lo real</h2>
        {brecha != null && brecha > 0 ? <b style={{ color: "var(--ui-warning-text)", fontWeight: 600 }}>{brecha} % debajo del oficial</b> : null}
      </div>
      <p className={v.nota}>
        Km por litro de cada tanque lleno.
        {oficial ? " El oficial sale de laboratorio; lo real es lo que le cuesta a tus proyectos." : ""}
      </p>
      {tanques.length ? (
        <>
          <div
            className={v.grafica}
            role="img"
            aria-label={`Rendimiento real de los últimos tanques${real ? `, ${real} km por litro` : ""}${oficial ? `, contra ${oficial} oficial` : ""}`}
          >
            {oficial ? (
              <>
                <div className={v.graficaOficial} style={{ bottom: alto(oficial) }} />
                <div className={v.graficaEtiqueta} style={{ bottom: alto(oficial) + 4 }}>
                  Oficial {oficial.toFixed(1)}
                </div>
              </>
            ) : null}
            {tanques.map((t, i) => (
              <div className={v.graficaColumna} key={`${t.fecha}-${i}`}>
                <span>{t.kmPorLitro.toFixed(1)}</span>
                <div className={v.graficaBarra} style={{ height: alto(t.kmPorLitro) }} />
              </div>
            ))}
          </div>
          <div className={v.graficaFechas}>
            {tanques.map((t, i) => (
              <span key={`${t.fecha}-${i}`}>{fechaCorta(t.fecha)}</span>
            ))}
          </div>
        </>
      ) : (
        <p className={c.hint}>
          {oficial ? `Oficial: ${kmPorLitro(oficial)}. ` : ""}
          Hacen falta dos tanques llenos para medir el primero.
        </p>
      )}
      {rendimiento.fuente === "OFICIAL" && rendimiento.faltan > 0 && tanques.length ? (
        <p className={c.hint}>
          La tarifa todavía usa el oficial: {rendimiento.faltan === 1 ? "falta 1 tanque" : `faltan ${rendimiento.faltan} tanques`} para usar el real.
        </p>
      ) : null}
    </section>
  );
}
