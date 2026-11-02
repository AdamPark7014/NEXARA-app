"use client";

/**
 * Costos · Tarifas de costo (mockup aprobado 01-11-2026). Solo CEO y contadora: aquí se ven sueldos.
 *
 * Tres cosas: el costo real por hora (factor de salario real), el costo por km o por día de vehículos
 * y herramienta mayor, y los parámetros del año. Las fórmulas viven en `apps/api/src/costos/calculos/`.
 * Contrato: `/api/costos/tarifas`.
 */

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useUser } from "@/components/UserContext";
import { Button, EmptyState, SkeletonRows } from "@/components/base";
import { Aviso, Dialogo } from "@/components/mesa-contable/piezas";
import EstandarVehiculos from "@/components/vehiculos/EstandarVehiculos";
import { Banda, Kpi, c, useAccesoCostos } from "@/components/costos/piezas";
import { formatApiError } from "@/lib/erp-api";
import {
  asignarPersona,
  crearEquipo,
  editarCategoria,
  fraccionATexto,
  getTarifas,
  guardarParametros,
  pesos,
  pesos2,
  quitarEquipo,
  recalcularLibro,
  textoAFraccion,
  type DatosEquipo,
  type Parametros,
  type Tarifas,
  type UnidadEquipo,
} from "@/lib/costos";

const UNIDAD_TEXTO: Record<UnidadEquipo, string> = { KM: "km", HORA: "hora", DIA: "día" };

type FormParametros = {
  ps: string;
  psValidado: boolean;
  otrosDias: string;
  aguinaldoDias: string;
  primaVacacional: string;
  kh: string;
  ks: string;
  indirectoPct: string;
  tasaInteres: string;
};

function aFormulario(p: Parametros): FormParametros {
  return {
    ps: fraccionATexto(p.ps),
    psValidado: p.psValidado,
    otrosDias: String(p.otrosDias),
    aguinaldoDias: String(p.aguinaldoDias),
    primaVacacional: fraccionATexto(p.primaVacacional),
    kh: fraccionATexto(p.kh),
    ks: fraccionATexto(p.ks),
    indirectoPct: fraccionATexto(p.indirectoPct),
    tasaInteres: fraccionATexto(p.tasaInteres),
  };
}

const EQUIPO_VACIO = {
  tipo: "VEHICULO" as DatosEquipo["tipo"],
  nombre: "",
  unidad: "KM" as UnidadEquipo,
  vehicleId: "",
  toolId: "",
  valor: "",
  valorLlantas: "",
  rescatePct: "30",
  vidaUnidades: "",
  unidadesAnio: "",
  tasaInteres: "12",
  primaSeguro: "4",
  ko: "0.6",
  rendimiento: "",
  precioCombustible: "",
  costoAceite: "",
  aceiteCadaUnidades: "",
  vidaLlantasUnidades: "",
  otrosAnuales: "",
};

const numeroONada = (t: string) => {
  const n = Number(t.trim().replace(",", "."));
  return t.trim() && Number.isFinite(n) ? n : undefined;
};

export default function TarifasDeCosto() {
  const { token } = useUser();
  const acceso = useAccesoCostos(token);
  const anioActual = new Date().getFullYear();
  const [anio, setAnio] = useState(anioActual);
  const [datos, setDatos] = useState<Tarifas | null>(null);
  const [form, setForm] = useState<FormParametros | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [recalculando, setRecalculando] = useState(false);
  const [equipo, setEquipo] = useState<typeof EQUIPO_VACIO | null>(null);

  const cargar = useCallback(async () => {
    if (!token) return;
    try {
      const t = await getTarifas(token, anio);
      setDatos(t);
      setForm(aFormulario(t.parametros));
    } catch (e) {
      setError(formatApiError(e, "No se pudieron leer las tarifas."));
    }
  }, [token, anio]);

  useEffect(() => {
    if (acceso?.veTodo) void cargar();
  }, [acceso?.veTodo, cargar]);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!token || !form) return;
    const ps = textoAFraccion(form.ps);
    if (ps == null) {
      setError("Escribe las cuotas de IMSS e Infonavit como porcentaje.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await guardarParametros(token, anio, {
        ps,
        psValidado: form.psValidado,
        otrosDias: Number(form.otrosDias) || 0,
        aguinaldoDias: Number(form.aguinaldoDias) || 15,
        primaVacacional: textoAFraccion(form.primaVacacional) ?? 0.25,
        kh: textoAFraccion(form.kh) ?? 0.03,
        ks: textoAFraccion(form.ks) ?? 0.01,
        indirectoPct: textoAFraccion(form.indirectoPct),
        tasaInteres: textoAFraccion(form.tasaInteres),
      });
      setAviso("Guardado. Recalcula el libro para que los proyectos usen estos valores.");
      await cargar();
    } catch (err) {
      setError(formatApiError(err, "No se pudo guardar."));
    } finally {
      setGuardando(false);
    }
  }

  async function recalcular() {
    if (!token) return;
    setRecalculando(true);
    setError(null);
    try {
      const r = await recalcularLibro(token);
      setAviso(`Libro al día: ${r.total} renglones (${r.creados} nuevos, ${r.actualizados} cambiados, ${r.borrados} quitados).`);
    } catch (err) {
      setError(formatApiError(err, "No se pudo recalcular."));
    } finally {
      setRecalculando(false);
    }
  }

  async function cambiarCategoria(userId: number, valor: string) {
    if (!token) return;
    try {
      await asignarPersona(token, userId, { categoriaId: valor ? Number(valor) : null });
      await cargar();
    } catch (err) {
      setError(formatApiError(err, "No se pudo cambiar la categoría."));
    }
  }

  async function cambiarReferencia(id: number, texto: string) {
    if (!token) return;
    try {
      await editarCategoria(token, id, { sueldoSemanalRef: numeroONada(texto) ?? null });
      await cargar();
    } catch (err) {
      setError(formatApiError(err, "No se pudo guardar el sueldo de referencia."));
    }
  }

  async function guardarEquipo(e?: FormEvent) {
    e?.preventDefault();
    if (!token || !equipo) return;
    const datosEquipo: DatosEquipo = {
      tipo: equipo.tipo,
      nombre: equipo.nombre.trim(),
      unidad: equipo.unidad,
      vehicleId: equipo.tipo === "VEHICULO" && equipo.vehicleId ? Number(equipo.vehicleId) : null,
      toolId: equipo.tipo === "HERRAMIENTA" && equipo.toolId ? Number(equipo.toolId) : null,
      valor: numeroONada(equipo.valor) ?? 0,
      valorLlantas: numeroONada(equipo.valorLlantas),
      rescatePct: textoAFraccion(equipo.rescatePct) ?? 0,
      vidaUnidades: numeroONada(equipo.vidaUnidades) ?? 0,
      unidadesAnio: numeroONada(equipo.unidadesAnio) ?? 0,
      tasaInteres: textoAFraccion(equipo.tasaInteres) ?? 0,
      primaSeguro: textoAFraccion(equipo.primaSeguro) ?? 0,
      ko: numeroONada(equipo.ko) ?? 0,
      rendimiento: numeroONada(equipo.rendimiento),
      precioCombustible: numeroONada(equipo.precioCombustible),
      costoAceite: numeroONada(equipo.costoAceite),
      aceiteCadaUnidades: numeroONada(equipo.aceiteCadaUnidades),
      vidaLlantasUnidades: numeroONada(equipo.vidaLlantasUnidades),
      otrosAnuales: numeroONada(equipo.otrosAnuales),
    };
    try {
      await crearEquipo(token, datosEquipo);
      setEquipo(null);
      await cargar();
    } catch (err) {
      setError(formatApiError(err, "No se pudo guardar el equipo."));
    }
  }

  if (acceso && !acceso.veTodo) {
    return (
      <div className={c.page}>
        <Banda acceso={acceso} titulo="Tarifas de costo" />
        <EmptyState title="Las tarifas son de dirección y contabilidad" description="Aquí se ven sueldos, así que no están abiertas a todos." />
      </div>
    );
  }

  const f = datos?.factor;
  const av = datos?.avisos;
  const campo = (id: keyof FormParametros, texto: string, sufijo?: string) =>
    form ? (
      <label className={c.campo} htmlFor={`p-${id}`}>
        {texto}
        {sufijo ? ` (${sufijo})` : ""}
        <input
          id={`p-${id}`}
          inputMode="decimal"
          value={String(form[id])}
          onChange={(e) => setForm({ ...form, [id]: e.target.value })}
        />
      </label>
    ) : null;
  const campoEquipo = (id: keyof typeof EQUIPO_VACIO, texto: string) =>
    equipo ? (
      <label className={c.campo} htmlFor={`e-${id}`}>
        {texto}
        <input id={`e-${id}`} value={String(equipo[id])} onChange={(e) => setEquipo({ ...equipo, [id]: e.target.value })} />
      </label>
    ) : null;

  return (
    <div className={c.page}>
      <Banda
        acceso={acceso}
        titulo="Tarifas de costo"
        subtitulo="Lo que de verdad cuesta una hora, un kilómetro o un día de equipo. Calculado con el método del Reglamento de Obras Públicas."
      >
        <div className={c.kpis}>
          <Kpi cifra={f?.fsr.toFixed(2) ?? "—"} texto="Factor de salario real" />
          <Kpi cifra={f ? `${f.tp} ÷ ${f.tl}` : "—"} texto="Días pagados ÷ trabajados" />
          <Kpi cifra={form ? `${form.ps} %` : "—"} texto={av?.psSinValidar ? "Cuotas: sin validar" : "Cuotas: validadas"} tono={av?.psSinValidar ? "atencion" : "ok"} />
          <Kpi cifra={form?.indirectoPct ? `${form.indirectoPct} %` : "—"} texto="Indirectos del año" />
        </div>
      </Banda>

      {error ? <Aviso tono="danger" role="alert">{error}</Aviso> : null}
      {aviso ? <Aviso tono="success">{aviso}</Aviso> : null}
      {av?.psSinValidar ? (
        <Aviso tono="warning" titulo="Cifras provisionales.">
          Las cuotas de IMSS e Infonavit son un supuesto de 25 % hasta que la contadora capture lo que se paga en el SUA.
        </Aviso>
      ) : null}
      {av?.personasSinSueldo ? (
        <Aviso tono="warning">
          {av.personasSinSueldo === 1 ? "1 persona no tiene" : `${av.personasSinSueldo} personas no tienen`} sueldo capturado: sus horas valen cero.
        </Aviso>
      ) : null}

      {!datos || !form ? (
        <section className={c.card}>
          <SkeletonRows rows={5} />
        </section>
      ) : (
        <>
          <div className={c.cols3}>
            <section className={c.card} aria-label="Mano de obra por categoría">
              <h2 className={c.cardTitle}>Mano de obra, costo por hora</h2>
              <div className={c.lista}>
                {datos.categorias.map((k) => (
                  <div key={k.id}>
                    <span>
                      {k.nombre}
                      {k.personas ? ` · ${k.personas}` : ""}
                    </span>
                    <span className={c.num}>{pesos2(k.costoHora)}</span>
                  </div>
                ))}
              </div>
              <p className={c.hint}>
                {f?.diasHabiles} días hábiles, menos {f?.festivosEnDiaHabil} festivos, {f?.vacacionesDias} de vacaciones y {form.otrosDias} de permiso.
              </p>
            </section>

            <section className={c.card} aria-label="Vehículos y herramienta mayor">
              <h2 className={c.cardTitle}>Vehículos y herramienta mayor</h2>
              {!datos.equipos.length ? (
                <p className={c.hint}>
                  Aún no hay fichas. {av?.vehiculosSinFicha ? `${av.vehiculosSinFicha} vehículo sin ficha.` : ""} Da de alta uno con su valor, vida útil y consumo para sacar su costo.
                </p>
              ) : (
                <div className={c.lista}>
                  {datos.equipos.map((q) => (
                    <div key={q.id}>
                      <span>{q.nombre}</span>
                      <span className={c.num}>
                        {pesos2(q.tarifa.total)} / {UNIDAD_TEXTO[q.unidad]}{" "}
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Quitar ${q.nombre}`}
                          onClick={() => token && void quitarEquipo(token, q.id).then(cargar)}
                        >
                          Quitar
                        </Button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {datos.equipos[0] ? (
                <>
                  <div
                    className={c.split}
                    role="img"
                    aria-label={`Fijos ${pesos2(datos.equipos[0].tarifa.fijos)}, consumos ${pesos2(datos.equipos[0].tarifa.consumos)}`}
                  >
                    <i style={{ width: `${(datos.equipos[0].tarifa.fijos / (datos.equipos[0].tarifa.total || 1)) * 100}%`, background: "var(--ui-brand)" }} />
                    <i style={{ width: `${(datos.equipos[0].tarifa.consumos / (datos.equipos[0].tarifa.total || 1)) * 100}%`, background: "var(--ui-accent-orange)" }} />
                  </div>
                  <p className={c.hint}>
                    {datos.equipos[0].nombre}: fijos {pesos2(datos.equipos[0].tarifa.fijos)}, consumos {pesos2(datos.equipos[0].tarifa.consumos)}.
                  </p>
                </>
              ) : null}
              <div className={c.pie}>
                <Button variant="secondary" size="sm" onClick={() => setEquipo({ ...EQUIPO_VACIO })}>
                  Agregar equipo
                </Button>
              </div>
            </section>

            <section className={c.card} aria-label="Herramienta e indirectos">
              <h2 className={c.cardTitle}>Herramienta e indirectos</h2>
              <div className={c.lista}>
                <div>
                  <span>Herramienta menor</span>
                  <span className={c.num}>{form.kh} % de la mano de obra</span>
                </div>
                <div>
                  <span>Equipo de seguridad</span>
                  <span className={c.num}>{form.ks} % de la mano de obra</span>
                </div>
                <div>
                  <span>Indirectos del año</span>
                  <span className={c.num}>{form.indirectoPct ? `${form.indirectoPct} %` : "Sin capturar"}</span>
                </div>
              </div>
              <p className={c.hint}>Estos porcentajes son valores iniciales ajustables. El Reglamento no fija ninguno.</p>
            </section>
          </div>

          <form className={c.card} onSubmit={guardar} aria-label="Parámetros del año">
            <h2 className={c.cardTitle}>Parámetros de {anio}</h2>
            <div className={c.campos}>
              <label className={c.campo} htmlFor="p-anio">
                Año
                <select id="p-anio" value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
                  {[anioActual - 1, anioActual, anioActual + 1].map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </label>
              {campo("ps", "Cuotas IMSS e Infonavit", "%")}
              {campo("otrosDias", "Permisos al año", "días")}
              {campo("aguinaldoDias", "Aguinaldo", "días")}
              {campo("primaVacacional", "Prima vacacional", "%")}
              {campo("kh", "Herramienta menor", "% Mo")}
              {campo("ks", "Equipo de seguridad", "% Mo")}
              {campo("indirectoPct", "Indirectos del año", "%")}
              {campo("tasaInteres", "Tasa anual", "%")}
            </div>
            <div className={c.pie}>
              <label className={c.marca} htmlFor="p-validado">
                <input
                  id="p-validado"
                  type="checkbox"
                  checked={form.psValidado}
                  onChange={(e) => setForm({ ...form, psValidado: e.target.checked })}
                />
                Las cuotas ya las confirmó la contadora con el SUA
              </label>
              <span className={c.acciones}>
                <Button variant="secondary" type="button" loading={recalculando} onClick={() => void recalcular()}>
                  Recalcular el libro
                </Button>
                <Button variant="primary" type="submit" loading={guardando}>
                  Guardar
                </Button>
              </span>
            </div>
          </form>

          {token ? <EstandarVehiculos token={token} /> : null}

          <section className={`${c.card} ${c.scroll}`} aria-label="Categorías">
            <h2 className={c.cardTitle}>Categorías</h2>
            <table className={c.tabla}>
              <thead>
                <tr>
                  <th>Categoría</th>
                  <th>Va a</th>
                  <th className={c.der}>Personas</th>
                  <th>Sueldo de referencia a la semana</th>
                  <th className={c.der}>Costo por hora</th>
                </tr>
              </thead>
              <tbody>
                {datos.categorias.map((k) => (
                  <tr key={k.id}>
                    <td>{k.nombre}</td>
                    <td>
                      <span className={c.pastilla} data-tone={k.tipo === "DIRECTO" ? "ok" : undefined}>
                        {k.tipo === "DIRECTO" ? "Costo directo" : "Indirectos"}
                      </span>
                    </td>
                    <td className={c.der}>{k.personas}</td>
                    <td>
                      <input
                        className={c.buscar}
                        style={{ minHeight: 32, maxWidth: 130 }}
                        defaultValue={k.sueldoSemanalRef ?? ""}
                        placeholder="Promedio"
                        inputMode="decimal"
                        aria-label={`Sueldo de referencia de ${k.nombre}`}
                        onBlur={(e) => {
                          if (e.target.value !== String(k.sueldoSemanalRef ?? "")) void cambiarReferencia(k.id, e.target.value);
                        }}
                      />
                    </td>
                    <td className={c.der}>
                      {pesos2(k.costoHora)}
                      <small>{k.origenTarifa === "REFERENCIA" ? "Por referencia" : "Promedio real"}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className={`${c.card} ${c.scroll}`} aria-label="Personas">
            <h2 className={c.cardTitle}>Personas</h2>
            <table className={c.tabla}>
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Categoría</th>
                  <th className={c.der}>Sueldo a la semana</th>
                  <th className={c.der}>Vacaciones</th>
                  <th className={c.der}>Factor</th>
                  <th className={c.der}>Costo por hora</th>
                </tr>
              </thead>
              <tbody>
                {datos.personas.map((p) => (
                  <tr key={p.userId}>
                    <td>
                      {p.nombre}
                      <small>{p.puesto}</small>
                    </td>
                    <td>
                      <select
                        value={p.categoriaId ?? ""}
                        aria-label={`Categoría de ${p.nombre}`}
                        onChange={(e) => void cambiarCategoria(p.userId, e.target.value)}
                      >
                        <option value="">Sin categoría</option>
                        {datos.categorias.map((k) => (
                          <option key={k.id} value={k.id}>
                            {k.nombre}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className={c.der}>{p.sinSueldo ? "Sin capturar" : pesos(p.sueldoSemanal)}</td>
                    <td className={c.der}>{p.vacacionesDias} días</td>
                    <td className={c.der}>{p.fsr.toFixed(2)}</td>
                    <td className={c.der}>{p.sinSueldo ? "—" : pesos2(p.costoHora)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

      <Dialogo
        abierto={Boolean(equipo)}
        titulo="Agregar equipo"
        descripcion="Con esto se saca su costo por km o por día. Lo de consumo es opcional para herramienta."
        onCerrar={() => setEquipo(null)}
        onEnviar={() => void guardarEquipo()}
        acciones={
          <>
            <Button variant="ghost" onClick={() => setEquipo(null)}>
              Cancelar
            </Button>
            <Button variant="primary" type="submit">
              Guardar
            </Button>
          </>
        }
      >
        {equipo ? (
          <div className={c.campos}>
            <label className={c.campo} htmlFor="e-tipo">
              Tipo
              <select
                id="e-tipo"
                value={equipo.tipo}
                onChange={(e) => {
                  const tipo = e.target.value as DatosEquipo["tipo"];
                  setEquipo(
                    tipo === "VEHICULO"
                      ? { ...equipo, tipo, unidad: "KM", rescatePct: "30", ko: "0.6", tasaInteres: "12", primaSeguro: "4" }
                      : { ...equipo, tipo, unidad: "DIA", rescatePct: "10", ko: "0.2", tasaInteres: "0", primaSeguro: "0" },
                  );
                }}
              >
                <option value="VEHICULO">Vehículo</option>
                <option value="HERRAMIENTA">Herramienta mayor</option>
              </select>
            </label>
            {campoEquipo("nombre", "Nombre")}
            <label className={c.campo} htmlFor="e-unidad">
              Se mide por
              <select id="e-unidad" value={equipo.unidad} onChange={(e) => setEquipo({ ...equipo, unidad: e.target.value as UnidadEquipo })}>
                <option value="KM">Kilómetro</option>
                <option value="HORA">Hora</option>
                <option value="DIA">Día</option>
              </select>
            </label>
            {equipo.tipo === "VEHICULO" && datos?.vehiculos.length ? (
              <label className={c.campo} htmlFor="e-vehiculo">
                Vehículo del catálogo
                <select id="e-vehiculo" value={equipo.vehicleId} onChange={(e) => setEquipo({ ...equipo, vehicleId: e.target.value })}>
                  <option value="">Ninguno</option>
                  {datos.vehiculos.map((v) => (
                    <option key={v.id} value={v.id}>
                      {[v.nombre, v.placas].filter(Boolean).join(" · ")}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {campoEquipo("valor", "Valor nuevo ($)")}
            {campoEquipo("rescatePct", "Rescate al final (%)")}
            {campoEquipo("vidaUnidades", `Vida útil (${UNIDAD_TEXTO[equipo.unidad]}s)`)}
            {campoEquipo("unidadesAnio", `Uso al año (${UNIDAD_TEXTO[equipo.unidad]}s)`)}
            {campoEquipo("tasaInteres", "Tasa anual (%)")}
            {campoEquipo("primaSeguro", "Seguro anual (% del valor)")}
            {campoEquipo("ko", "Mantenimiento (Ko)")}
            {campoEquipo("otrosAnuales", "Tenencia y otros al año ($)")}
            {equipo.tipo === "VEHICULO" ? (
              <>
                {campoEquipo("rendimiento", "Rendimiento (km/L)")}
                {campoEquipo("precioCombustible", "Precio del litro ($)")}
                {campoEquipo("costoAceite", "Cambio de aceite ($)")}
                {campoEquipo("aceiteCadaUnidades", "Cada cuántos km")}
                {campoEquipo("valorLlantas", "Juego de llantas ($)")}
                {campoEquipo("vidaLlantasUnidades", "Vida de las llantas (km)")}
              </>
            ) : null}
          </div>
        ) : null}
      </Dialogo>
    </div>
  );
}
