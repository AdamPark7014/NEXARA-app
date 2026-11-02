"use client";

/**
 * Tarifas › Estándar de vehículos: con qué arranca cada vehículo nuevo. Vive aquí porque trae cifras de
 * dinero. No cambia las fichas ya guardadas ni los viajes cargados.
 */

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/base";
import { Aviso } from "@/components/mesa-contable/piezas";
import { formatApiError } from "@/lib/erp-api";
import { aNumero, aPorcentaje, getOmisiones, guardarEstandar, type Omisiones, type PlanEditable } from "@/lib/vehiculos-ficha";
import { FilaPrograma, c, v } from "./piezas";

const CAMPOS: ReadonlyArray<{ id: keyof Omisiones; nombre: string; pct?: boolean; min?: number; max?: number }> = [
  { id: "valorLlantas", nombre: "Valor de las llantas ($)" },
  { id: "rescatePct", nombre: "Valor al venderla (%)", pct: true, max: 100 },
  { id: "vidaKm", nombre: "Vida útil (km)", min: 1000 },
  { id: "kmAnio", nombre: "Km al año", min: 100 },
  { id: "precioCombustible", nombre: "Gasolina ($/L)" },
  { id: "tasaInteres", nombre: "Costo del dinero (% anual)", pct: true, max: 200 },
  { id: "primaSeguro", nombre: "Seguro (% anual)", pct: true, max: 100 },
  { id: "ko", nombre: "Mantenimiento (veces el desgaste)", max: 5 },
  { id: "costoAceite", nombre: "Cambio de aceite ($)" },
  { id: "aceiteCadaKm", nombre: "Aceite cada (km)", min: 100 },
  { id: "vidaLlantasKm", nombre: "Las llantas duran (km)", min: 100 },
  { id: "otrosAnuales", nombre: "Tenencia y verificación ($/año)" },
];

type Formulario = Record<keyof Omisiones, string>;

export default function EstandarVehiculos({ token }: { token: string }) {
  const [form, setForm] = useState<Formulario | null>(null);
  const [plan, setPlan] = useState<PlanEditable[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    getOmisiones(token)
      .then((o) => {
        if (!vivo) return;
        const lleno = {} as Formulario;
        for (const x of CAMPOS) {
          const dato = o[x.id] ?? 0;
          lleno[x.id] = String(x.pct ? aPorcentaje(dato) : dato);
        }
        setForm(lleno);
        setPlan(o.plan ?? []);
      })
      .catch((e) => vivo && setError(formatApiError(e, "No se pudo leer el estándar.")));
    return () => {
      vivo = false;
    };
  }, [token]);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setError(null);
    setAviso(null);
    const cifras = {} as Omisiones;
    for (const x of CAMPOS) {
      const n = aNumero(form[x.id]);
      if (n == null || n < (x.min ?? 0) || (x.max != null && n > x.max)) {
        const rango = x.max != null ? `de ${x.min ?? 0} a ${x.max}` : `desde ${(x.min ?? 0).toLocaleString("es-MX")}`;
        setError(`Revisa «${x.nombre}»: escribe un número ${rango}.`);
        return;
      }
      cifras[x.id] = x.pct ? n / 100 : n;
    }
    const filas = plan.filter((p) => p.concepto.trim());
    const incompleta = filas.find(
      (p) => (p.cadaKm == null && p.cadaMeses == null) || (p.cadaKm != null && p.cadaKm < 100) || (p.cadaMeses != null && (p.cadaMeses < 1 || p.cadaMeses > 240)),
    );
    if (incompleta) {
      setError(`Revisa «${incompleta.concepto}»: cada cuánto toca, desde 100 km o de 1 a 240 meses.`);
      return;
    }
    setGuardando(true);
    try {
      await guardarEstandar(token, {
        ...cifras,
        plan: filas.map((p) => ({ concepto: p.concepto.trim(), cadaKm: p.cadaKm ?? null, cadaMeses: p.cadaMeses ?? null })),
      });
      setAviso("Guardado. Los vehículos nuevos ya arrancan con estos valores; los que tienen ficha conservan los suyos.");
    } catch (err) {
      setError(formatApiError(err, "No se pudo guardar el estándar."));
    } finally {
      setGuardando(false);
    }
  }

  if (!form) {
    return error ? <Aviso tono="danger">{error}</Aviso> : null;
  }

  return (
    <form className={c.card} onSubmit={guardar} aria-label="Estándar de vehículos">
      <h2 className={c.cardTitle}>Estándar de vehículos</h2>
      <p className={c.hint}>
        Con esto arranca cada vehículo nuevo y se puede cambiar en su ficha. No toca los que ya tienen ficha. El Reglamento da la fórmula, no estas cifras: ajústalas a tu operación.
      </p>
      {error ? <Aviso tono="danger">{error}</Aviso> : null}
      {aviso ? <Aviso tono="success">{aviso}</Aviso> : null}
      <div className={c.campos}>
        {CAMPOS.map((x) => (
          <label className={c.campo} htmlFor={`estandar-${x.id}`} key={x.id}>
            {x.nombre}
            <input id={`estandar-${x.id}`} inputMode="decimal" value={form[x.id]} onChange={(e) => setForm({ ...form, [x.id]: e.target.value })} />
          </label>
        ))}
      </div>

      <div className={v.cabecera} style={{ marginTop: 16 }}>
        <h3 className={v.titulo}>Programa de servicio</h3>
        <Button variant="secondary" size="sm" type="button" onClick={() => setPlan((p) => [...p, { concepto: "", cadaKm: null, cadaMeses: null }])}>
          Agregar
        </Button>
      </div>
      <p className={c.hint}>Para el vehículo sin manual. Son valores de la empresa, no del fabricante: cuando se lee el manual, él manda.</p>
      {plan.map((p, i) => (
        <FilaPrograma
          key={i}
          fila={p}
          onCambio={(cambio) => setPlan((x) => x.map((y, j) => (j === i ? { ...y, ...cambio } : y)))}
          onQuitar={() => setPlan((x) => x.filter((_, j) => j !== i))}
        />
      ))}
      {!plan.length ? <p className={c.hint}>Sin renglones: los vehículos sin manual arrancarán sin programa.</p> : null}

      <div className={c.pie}>
        <span />
        <Button variant="primary" type="submit" loading={guardando}>
          Guardar estándar
        </Button>
      </div>
    </form>
  );
}
