"use client";

/**
 * Alta de un vehículo (mockup aprobado 01-11-2026): se sube el manual o se escribe el modelo, y la
 * segunda vista enseña lo que se encontró con la fuente de cada dato. Nada se guarda hasta confirmar.
 *
 * `?vehiculo=3` completa o corrige la ficha de uno que ya existe, y entra directo a la revisión.
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, ButtonLink, SkeletonRows } from "@/components/base";
import { useAccesoCostos } from "@/components/costos/piezas";
import { Aviso } from "@/components/mesa-contable/piezas";
import { useUser } from "@/components/UserContext";
import { IconoManual, Pastilla, PastillaFuente, c, v } from "@/components/vehiculos/piezas";
import { pesos2 } from "@/lib/costos";
import { formatApiError } from "@/lib/erp-api";
import { VEHICULOS_PATH } from "@/lib/recursos-core";
import {
  aNumero,
  buscarRendimientoOficial,
  getFicha,
  getOmisiones,
  guardarFicha,
  datosDelNombre,
  leerManual,
  nombreDeVehiculo,
  tarifaEstimada,
  type DatosFicha,
  type Fuente,
  type Omisiones,
  type PlanEditable,
} from "@/lib/vehiculos-ficha";

type Campo = { valor: string; fuente: Fuente | null };
type Campos = Record<string, Campo>;

const GRUPOS: ReadonlyArray<{ titulo: string; campos: ReadonlyArray<{ id: string; nombre: string; numero?: boolean }> }> = [
  {
    titulo: "Identidad y motor",
    campos: [
      { id: "marca", nombre: "Marca" },
      { id: "modelo", nombre: "Modelo" },
      { id: "anio", nombre: "Año", numero: true },
      { id: "version", nombre: "Versión" },
      { id: "motor", nombre: "Motor" },
      { id: "potenciaHp", nombre: "Potencia (hp)", numero: true },
      { id: "transmision", nombre: "Transmisión" },
      { id: "combustible", nombre: "Combustible" },
      { id: "numeroSerie", nombre: "Número de serie" },
    ],
  },
  {
    titulo: "Capacidades y llantas",
    campos: [
      { id: "tanqueLitros", nombre: "Tanque (L)", numero: true },
      { id: "aceiteTipo", nombre: "Aceite de motor" },
      { id: "aceiteLitros", nombre: "Litros de aceite", numero: true },
      { id: "llantaMedida", nombre: "Llantas" },
      { id: "llantaPsi", nombre: "Presión (psi)", numero: true },
      { id: "cargaKg", nombre: "Carga máxima (kg)", numero: true },
    ],
  },
  { titulo: "Rendimiento", campos: [{ id: "rendimientoOficial", nombre: "Combinado (km/L)", numero: true }] },
];

const CAMPOS_NUMERICOS = new Set(GRUPOS.flatMap((g) => g.campos.filter((x) => x.numero).map((x) => x.id)));

/** Lo que se muestra de la ficha de costo, en la forma en que se captura: porcentajes como 30, no 0.3. */
type Costo = Record<keyof Omisiones | "valor", string>;

const costoDesde = (o: Omisiones, valor = ""): Costo => ({
  valor,
  valorLlantas: String(o.valorLlantas),
  rescatePct: String(Math.round(o.rescatePct * 100)),
  vidaKm: String(o.vidaKm),
  kmAnio: String(o.kmAnio),
  tasaInteres: String(Math.round(o.tasaInteres * 100)),
  primaSeguro: String(Math.round(o.primaSeguro * 100)),
  ko: String(o.ko),
  precioCombustible: String(o.precioCombustible),
  costoAceite: String(o.costoAceite),
  aceiteCadaKm: String(o.aceiteCadaKm),
  vidaLlantasKm: String(o.vidaLlantasKm),
  otrosAnuales: String(o.otrosAnuales),
});

const CAMPOS_COSTO: ReadonlyArray<{ id: keyof Costo; nombre: string }> = [
  { id: "valor", nombre: "Precio de compra" },
  { id: "valorLlantas", nombre: "Valor de las llantas" },
  { id: "rescatePct", nombre: "Valor al venderla (%)" },
  { id: "vidaKm", nombre: "Vida útil (km)" },
  { id: "kmAnio", nombre: "Km al año" },
  { id: "precioCombustible", nombre: "Gasolina ($/L)" },
];

const CAMPOS_COSTO_MAS: ReadonlyArray<{ id: keyof Costo; nombre: string }> = [
  { id: "tasaInteres", nombre: "Costo del dinero (% anual)" },
  { id: "primaSeguro", nombre: "Seguro (% anual)" },
  { id: "ko", nombre: "Mantenimiento (veces el desgaste)" },
  { id: "costoAceite", nombre: "Cambio de aceite ($)" },
  { id: "aceiteCadaKm", nombre: "Aceite cada (km)" },
  { id: "vidaLlantasKm", nombre: "Las llantas duran (km)" },
  { id: "otrosAnuales", nombre: "Tenencia y verificación ($/año)" },
];

export default function Pagina() {
  return (
    <Suspense fallback={<SkeletonRows rows={6} />}>
      <AltaVehiculo />
    </Suspense>
  );
}

function AltaVehiculo() {
  const router = useRouter();
  const params = useSearchParams();
  const { token } = useUser();
  const acceso = useAccesoCostos(token);
  const veCostos = Boolean(acceso?.veTodo);
  const vehiculoId = params?.get("vehiculo") ?? null;

  const [paso, setPaso] = useState<1 | 2>(vehiculoId ? 2 : 1);
  const [cargando, setCargando] = useState(Boolean(vehiculoId));
  const [archivo, setArchivo] = useState<File | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [leyendo, setLeyendo] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [campos, setCampos] = useState<Campos>({});
  const [nombre, setNombre] = useState("");
  const [placas, setPlacas] = useState("");
  const [kmHoy, setKmHoy] = useState("");
  const [fechaCompra, setFechaCompra] = useState("");
  const [plan, setPlan] = useState<PlanEditable[]>([]);
  const [manual, setManual] = useState<DatosFicha["manual"]>(null);
  const [costo, setCosto] = useState<Costo | null>(null);
  const [ajustando, setAjustando] = useState(false);
  const [recostear, setRecostear] = useState(false);
  const [tieneTarifa, setTieneTarifa] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  const valor = (id: string) => campos[id]?.valor ?? "";
  const poner = (id: string, texto: string) => setCampos((x) => ({ ...x, [id]: { valor: texto, fuente: { tipo: "CAPTURA" } } }));

  // Valores iniciales de la ficha de costo.
  useEffect(() => {
    if (!token) return;
    getOmisiones(token)
      .then((o) => setCosto((previo) => previo ?? costoDesde(o)))
      .catch(() => undefined);
  }, [token]);

  // Corregir una ficha: entra a la revisión con lo que ya tiene.
  useEffect(() => {
    if (!token || !vehiculoId) return;
    let vivo = true;
    getFicha(token, vehiculoId)
      .then((f) => {
        if (!vivo) return;
        setNombre(f.vehiculo.nombre);
        setPlacas(f.vehiculo.placas ?? "");
        const e = f.especificacion;
        if (e) {
          const llenos: Campos = {};
          for (const id of GRUPOS.flatMap((g) => g.campos.map((x) => x.id))) {
            const dato = (e as Record<string, unknown>)[id];
            if (dato != null && dato !== "") llenos[id] = { valor: String(dato), fuente: e.fuentes?.[id] ?? { tipo: "CAPTURA" } };
          }
          setCampos(llenos);
          setKmHoy(e.odometroAlta != null ? String(e.odometroAlta) : "");
          setFechaCompra(e.fechaCompra ?? "");
        } else {
          // Sin ficha: lo que se sabe sale del nombre que ya tiene.
          setKmHoy(f.odometro ? String(f.odometro.km) : "");
          const delNombre: Campos = {};
          for (const [id, dato] of Object.entries(datosDelNombre(f.vehiculo.nombre))) {
            delNombre[id] = { valor: dato as string, fuente: { tipo: "CAPTURA" } };
          }
          setCampos(delNombre);
        }
        setPlan(f.programa.map((p) => ({ id: p.id, concepto: p.concepto, cadaKm: p.cadaKm, cadaMeses: p.cadaMeses, costoEstimado: p.costoEstimado })));
        if (f.costos) {
          const x = f.costos.ficha;
          setTieneTarifa(true);
          setCosto({
            valor: String(x.valor),
            valorLlantas: String(x.valorLlantas),
            rescatePct: String(Math.round(x.rescatePct * 100)),
            vidaKm: String(x.vidaKm),
            kmAnio: String(x.kmAnio),
            tasaInteres: String(Math.round(x.tasaInteres * 100)),
            primaSeguro: String(Math.round(x.primaSeguro * 100)),
            ko: String(x.ko),
            precioCombustible: String(f.costos.precioLitro ?? ""),
            costoAceite: String(x.costoAceite),
            aceiteCadaKm: String(x.aceiteCadaKm),
            vidaLlantasKm: String(x.vidaLlantasKm),
            otrosAnuales: String(x.otrosAnuales),
          });
        }
        setPaso(f.tieneFicha ? 2 : 1);
      })
      .catch((e) => vivo && setError(formatApiError(e, "No se pudo leer el vehículo")))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [token, vehiculoId]);

  const buscarOficial = useCallback(
    async (actuales: Campos): Promise<Campos> => {
      if (actuales.rendimientoOficial?.valor) return actuales;
      const marca = actuales.marca?.valor;
      const modelo = actuales.modelo?.valor;
      if (!marca || !modelo) return actuales;
      try {
        const { rendimiento } = await buscarRendimientoOficial(token as string, {
          marca,
          modelo,
          anio: aNumero(actuales.anio?.valor),
          version: actuales.version?.valor,
          transmision: actuales.transmision?.valor,
          combustible: actuales.combustible?.valor,
        });
        if (rendimiento) {
          return { ...actuales, rendimientoOficial: { valor: String(rendimiento.valor), fuente: rendimiento.fuente } };
        }
      } catch {
        // Sin catálogo se captura a mano; las cargas reales lo corrigen de todos modos.
      }
      return actuales;
    },
    [token],
  );

  async function leerYRevisar() {
    if (!token) return;
    setError(null);
    setAviso(null);
    let actuales = campos;
    if (archivo) {
      setLeyendo("Leyendo el manual…");
      try {
        const pista = nombreDeVehiculo({ marca: valor("marca"), modelo: valor("modelo"), anio: valor("anio") });
        const r = await leerManual(token, archivo, pista);
        setManual(r.archivo);
        if (r.escaneado) {
          setAviso("Ese PDF es una imagen escaneada: no trae texto que leer. El manual queda guardado; llena lo principal a mano.");
        } else if (!Object.keys(r.campos).length && !r.servicios.length) {
          setAviso("No se encontraron datos en el manual. Queda guardado; llena lo principal a mano.");
        }
        const llenos: Campos = { ...actuales };
        for (const [id, c2] of Object.entries(r.campos)) {
          // Lo que la persona ya escribió manda sobre lo que se leyó.
          if (!llenos[id]?.valor) llenos[id] = { valor: String(c2.valor), fuente: c2.fuente };
        }
        actuales = llenos;
        if (r.servicios.length) setPlan(r.servicios);
      } catch (e) {
        setAviso(`${formatApiError(e, "No se pudo leer el manual")}. Puedes llenarlo a mano.`);
      }
    }
    setLeyendo("Buscando el rendimiento oficial…");
    actuales = await buscarOficial(actuales);
    setCampos(actuales);
    setLeyendo(null);
    setPaso(2);
  }

  const rendimiento = aNumero(valor("rendimientoOficial"));
  const porKm = useMemo(() => {
    if (!costo) return null;
    return tarifaEstimada({
      valor: aNumero(costo.valor) ?? 0,
      valorLlantas: aNumero(costo.valorLlantas) ?? 0,
      rescatePct: (aNumero(costo.rescatePct) ?? 0) / 100,
      vidaKm: aNumero(costo.vidaKm) ?? 0,
      kmAnio: aNumero(costo.kmAnio) ?? 0,
      tasaInteres: (aNumero(costo.tasaInteres) ?? 0) / 100,
      primaSeguro: (aNumero(costo.primaSeguro) ?? 0) / 100,
      ko: aNumero(costo.ko) ?? 0,
      precioCombustible: aNumero(costo.precioCombustible) ?? 0,
      rendimiento,
      costoAceite: aNumero(costo.costoAceite) ?? 0,
      aceiteCadaKm: aNumero(costo.aceiteCadaKm) ?? 0,
      vidaLlantasKm: aNumero(costo.vidaLlantasKm) ?? 0,
      otrosAnuales: aNumero(costo.otrosAnuales) ?? 0,
    });
  }, [costo, rendimiento]);

  async function guardar() {
    if (!token) return;
    const nombreFinal = nombre.trim() || nombreDeVehiculo({ marca: valor("marca"), modelo: valor("modelo"), anio: valor("anio") });
    if (!vehiculoId && !nombreFinal) {
      setError("Escribe la marca y el modelo del vehículo");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const datos: DatosFicha = { nombre: nombreFinal || null, placas: placas.trim() || null, fuentes: {} };
      const destino = datos as Record<string, unknown>;
      for (const [id, campo] of Object.entries(campos)) {
        const dato = campo.valor.trim();
        destino[id] = CAMPOS_NUMERICOS.has(id) ? aNumero(dato) : dato || null;
        if (dato && campo.fuente) (datos.fuentes as Record<string, Fuente>)[id] = campo.fuente;
      }
      datos.odometroAlta = aNumero(kmHoy) == null ? null : Math.trunc(aNumero(kmHoy) as number);
      datos.fechaCompra = fechaCompra || null;
      datos.plan = plan
        .filter((p) => p.concepto.trim())
        .map((p) => ({
          ...(p.id ? { id: p.id } : {}),
          concepto: p.concepto.trim(),
          cadaKm: aNumero(p.cadaKm),
          cadaMeses: aNumero(p.cadaMeses),
          paginaManual: p.paginaManual ?? null,
          costoEstimado: p.costoEstimado ?? null,
        }));
      if (manual) datos.manual = manual;
      const precio = costo ? aNumero(costo.valor) : null;
      if (veCostos && costo && precio) {
        datos.costo = {
          valor: precio,
          valorLlantas: aNumero(costo.valorLlantas) ?? undefined,
          rescatePct: (aNumero(costo.rescatePct) ?? 0) / 100,
          vidaKm: aNumero(costo.vidaKm) ?? undefined,
          kmAnio: aNumero(costo.kmAnio) ?? undefined,
          tasaInteres: (aNumero(costo.tasaInteres) ?? 0) / 100,
          primaSeguro: (aNumero(costo.primaSeguro) ?? 0) / 100,
          ko: aNumero(costo.ko) ?? undefined,
          precioCombustible: aNumero(costo.precioCombustible) ?? undefined,
          costoAceite: aNumero(costo.costoAceite) ?? undefined,
          aceiteCadaKm: aNumero(costo.aceiteCadaKm) ?? undefined,
          vidaLlantasKm: aNumero(costo.vidaLlantasKm) ?? undefined,
          otrosAnuales: aNumero(costo.otrosAnuales) ?? undefined,
        };
      }
      const f = await guardarFicha(token, vehiculoId, datos, recostear);
      router.push(`${VEHICULOS_PATH}/${f.vehiculo.id}`);
    } catch (e) {
      setError(formatApiError(e, "No se pudo guardar el vehículo"));
      setGuardando(false);
    }
  }

  if (cargando) return <SkeletonRows rows={6} />;

  if (paso === 1) {
    return (
      <div className={c.page} style={{ maxWidth: 760, margin: "0 auto" }}>
        <div>
          <h1 className={v.tituloPagina}>{vehiculoId ? `Ficha de ${nombre}` : "Agregar vehículo"}</h1>
          <p className={v.nota} style={{ margin: 0 }}>
            Sube el manual y nosotros llenamos la ficha. Tú solo revisas.
          </p>
        </div>
        {error ? <Aviso tono="danger">{error}</Aviso> : null}

        <section className={c.card} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            className={v.zonaArchivo}
            data-arrastrando={arrastrando}
            onDragOver={(e) => {
              e.preventDefault();
              setArrastrando(true);
            }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={(e) => {
              e.preventDefault();
              setArrastrando(false);
              setArchivo(e.dataTransfer.files?.[0] ?? null);
            }}
          >
            <IconoManual />
            <b>{archivo ? archivo.name : "Arrastra aquí el manual del vehículo"}</b>
            <span>{archivo ? "Listo para leer." : "PDF del manual del propietario, aunque tenga cientos de páginas."}</span>
            <input
              ref={entrada}
              type="file"
              accept="application/pdf,.pdf"
              hidden
              aria-label="Manual en PDF"
              onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            />
            <Button variant={archivo ? "secondary" : "primary"} type="button" onClick={() => entrada.current?.click()}>
              {archivo ? "Elegir otro" : "Elegir archivo"}
            </Button>
          </div>

          <div className={v.separador}>¿No lo tienes? Escribe el modelo</div>

          <div className={v.camposGrid}>
            <label className={v.campo}>
              Marca
              <input value={valor("marca")} onChange={(e) => poner("marca", e.target.value)} placeholder="Nissan" autoComplete="off" />
            </label>
            <label className={v.campo}>
              Modelo
              <input value={valor("modelo")} onChange={(e) => poner("modelo", e.target.value)} placeholder="Frontier" autoComplete="off" />
            </label>
            <label className={v.campo}>
              Año
              <input inputMode="numeric" value={valor("anio")} onChange={(e) => poner("anio", e.target.value)} placeholder="2026" />
            </label>
          </div>

          <div style={{ height: 1, background: "var(--ui-border-subtle)" }} />

          <div>
            <h2 className={v.titulo}>Lo que el manual no sabe</h2>
            <p className={v.nota}>{veCostos ? "Con estos datos ya sale el costo por kilómetro." : "Con estos datos ya se pueden contar sus kilómetros."}</p>
            <div className={v.camposGrid}>
              <label className={v.campo}>
                Placas
                <input value={placas} onChange={(e) => setPlacas(e.target.value.toUpperCase())} placeholder="TXA-12-34" autoComplete="off" />
              </label>
              <label className={v.campo}>
                Km de hoy
                <input inputMode="numeric" value={kmHoy} onChange={(e) => setKmHoy(e.target.value)} placeholder="12480" />
              </label>
              {veCostos && costo ? (
                <label className={v.campo}>
                  Precio de compra
                  <input inputMode="decimal" value={costo.valor} onChange={(e) => setCosto({ ...costo, valor: e.target.value })} placeholder="480000" />
                </label>
              ) : null}
              <label className={v.campo}>
                Fecha de compra
                <input type="date" value={fechaCompra} onChange={(e) => setFechaCompra(e.target.value)} />
              </label>
            </div>
          </div>
        </section>

        <div className={v.acciones} style={{ justifyContent: "flex-end" }}>
          <ButtonLink variant="secondary" href={vehiculoId ? `${VEHICULOS_PATH}/${vehiculoId}` : VEHICULOS_PATH}>
            Cancelar
          </ButtonLink>
          <Button disabled={Boolean(leyendo)} onClick={() => void leerYRevisar()}>
            {leyendo ?? (archivo ? "Leer y revisar" : "Continuar")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={c.page}>
      <div className={v.cabecera}>
        <div>
          <h1 className={v.tituloPagina}>
            {nombre.trim() || nombreDeVehiculo({ marca: valor("marca"), modelo: valor("modelo"), anio: valor("anio") }) || "Vehículo nuevo"}
          </h1>
          <p className={v.nota} style={{ margin: 0 }}>
            {manual?.paginas ? `Esto encontramos en las ${manual.paginas} páginas del manual. ` : ""}
            Cada dato dice de dónde salió; nada se guarda hasta que lo confirmes.
          </p>
        </div>
        <div className={v.acciones}>
          <ButtonLink variant="secondary" href={vehiculoId ? `${VEHICULOS_PATH}/${vehiculoId}` : VEHICULOS_PATH}>
            Cancelar
          </ButtonLink>
          <Button disabled={guardando} onClick={() => void guardar()}>
            {guardando ? "Guardando…" : "Guardar vehículo"}
          </Button>
        </div>
      </div>

      {aviso ? <Aviso tono="warning">{aviso}</Aviso> : null}
      {error ? <Aviso tono="danger">{error}</Aviso> : null}

      <div className={v.columnas}>
        <div className={v.principal}>
          {GRUPOS.map((g) => (
            <section className={c.card} key={g.titulo}>
              <h2 className={v.titulo} style={{ marginBottom: 6 }}>
                {g.titulo}
              </h2>
              {g.campos.map((x) => {
                const campo = campos[x.id];
                const lleno = Boolean(campo?.valor?.trim());
                return (
                  <div className={v.filaRevision} key={x.id}>
                    <label className={v.filaRevisionNombre} htmlFor={`campo-${x.id}`}>
                      {x.nombre}
                    </label>
                    <input
                      id={`campo-${x.id}`}
                      className={v.filaRevisionValor}
                      inputMode={x.numero ? "decimal" : undefined}
                      value={campo?.valor ?? ""}
                      placeholder="Sin dato: escríbelo si lo sabes"
                      onChange={(e) => poner(x.id, e.target.value)}
                    />
                    {lleno ? <PastillaFuente fuente={campo?.fuente} /> : <Pastilla tono="falta">Falta</Pastilla>}
                  </div>
                );
              })}
            </section>
          ))}

          <section className={c.card}>
            <div className={v.cabecera}>
              <h2 className={v.titulo}>Programa de servicio</h2>
              <Button variant="secondary" size="sm" type="button" onClick={() => setPlan((p) => [...p, { concepto: "", cadaKm: null, cadaMeses: null }])}>
                Agregar
              </Button>
            </div>
            {plan.length ? (
              plan.map((p, i) => (
                <div className={v.filaServicio} key={p.id ?? `nuevo-${i}`}>
                  <input
                    aria-label="Qué toca"
                    value={p.concepto}
                    placeholder="Aceite y filtro"
                    onChange={(e) => setPlan((x) => x.map((y, j) => (j === i ? { ...y, concepto: e.target.value } : y)))}
                  />
                  <span className={v.conUnidad}>
                    <input
                      aria-label="Cada cuántos km"
                      inputMode="numeric"
                      value={p.cadaKm ?? ""}
                      onChange={(e) => setPlan((x) => x.map((y, j) => (j === i ? { ...y, cadaKm: aNumero(e.target.value) } : y)))}
                    />
                    <span aria-hidden="true">km</span>
                  </span>
                  <span className={v.conUnidad}>
                    <input
                      aria-label="Cada cuántos meses"
                      inputMode="numeric"
                      value={p.cadaMeses ?? ""}
                      onChange={(e) => setPlan((x) => x.map((y, j) => (j === i ? { ...y, cadaMeses: aNumero(e.target.value) } : y)))}
                    />
                    <span aria-hidden="true">meses</span>
                  </span>
                  {p.paginaManual ? <PastillaFuente fuente={{ tipo: "MANUAL", pagina: p.paginaManual }} /> : <span />}
                  <button type="button" className={v.botonTexto} onClick={() => setPlan((x) => x.filter((_, j) => j !== i))} aria-label={`Quitar ${p.concepto || "renglón"}`}>
                    Quitar
                  </button>
                </div>
              ))
            ) : (
              <p className={c.hint}>Sin programa. Agrégalo aquí o déjalo para después: sin él, no avisa cuándo toca servicio.</p>
            )}
          </section>
        </div>

        <aside className={v.lateral}>
          {veCostos && costo ? (
            <>
              <section className={v.bandaCosto}>
                <span>Con estos datos, cada kilómetro cuesta</span>
                <b>{porKm == null ? "—" : pesos2(porKm)}</b>
                <p>
                  {porKm == null
                    ? "Falta el precio de compra."
                    : rendimiento
                      ? "Usa el rendimiento oficial. Con tus tres primeras cargas reales se ajusta solo."
                      : "Sin rendimiento todavía no cuenta la gasolina: se suma con tus primeras cargas."}
                </p>
              </section>
              <section className={c.card}>
                <h2 className={v.titulo}>Para calcular el costo</h2>
                <p className={v.nota}>Valores iniciales. El Reglamento da la fórmula, no estas cifras: ajústalas a tu operación.</p>
                <div style={{ display: "grid", gap: 10 }}>
                  {[...CAMPOS_COSTO, ...(ajustando ? CAMPOS_COSTO_MAS : [])].map((x) => (
                    <label className={v.campo} key={x.id}>
                      {x.nombre}
                      <input inputMode="decimal" value={costo[x.id]} onChange={(e) => setCosto({ ...costo, [x.id]: e.target.value })} />
                    </label>
                  ))}
                </div>
                <div style={{ marginTop: 10 }}>
                  <Button variant="secondary" size="sm" type="button" onClick={() => setAjustando((a) => !a)}>
                    {ajustando ? "Menos ajustes" : "Más ajustes"}
                  </Button>
                </div>
                {tieneTarifa ? (
                  <label className={v.casilla} style={{ marginTop: 10 }}>
                    <input type="checkbox" checked={recostear} onChange={(e) => setRecostear(e.target.checked)} />
                    Aplicar también a los viajes ya cargados
                  </label>
                ) : null}
              </section>
            </>
          ) : null}

          <section className={c.card}>
            <h2 className={v.titulo} style={{ marginBottom: 8 }}>
              Unidad
            </h2>
            <div style={{ display: "grid", gap: 10 }}>
              <label className={v.campo}>
                Nombre en la flotilla
                <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={nombreDeVehiculo({ marca: valor("marca"), modelo: valor("modelo"), anio: valor("anio") })} />
              </label>
              <label className={v.campo}>
                Placas
                <input value={placas} onChange={(e) => setPlacas(e.target.value.toUpperCase())} />
              </label>
              <label className={v.campo}>
                Km al darlo de alta
                <input inputMode="numeric" value={kmHoy} onChange={(e) => setKmHoy(e.target.value)} />
              </label>
              <label className={v.campo}>
                Fecha de compra
                <input type="date" value={fechaCompra} onChange={(e) => setFechaCompra(e.target.value)} />
              </label>
            </div>
          </section>

          {!veCostos ? (
            <p className={c.hint}>
              El costo por kilómetro lo captura dirección o contabilidad. <Link href={VEHICULOS_PATH}>Volver a la flotilla</Link>
            </p>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
