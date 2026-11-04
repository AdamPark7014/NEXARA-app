"use client";

/**
 * «¿Qué sigue?» y Mis pendientes (Velocidad Core, Ola 6): en Mis actividades, cuando no traes nada corriendo.
 * Las sugerencias las arma la API. «Empezar» crea la actividad a tu nombre y arranca el reloj, sin escribir nada.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert, Button, Card, Checkbox, Input } from "@/components/base";
import { formatApiError } from "@/lib/erp-api";
import {
  agregarPendiente,
  borrarPendiente,
  empezarPendiente,
  empezarSugerencia,
  fetchPendientes,
  fetchQueSigue,
  palomearPendiente,
  type Arrancada,
  type Pendiente,
  type QueSigue as Datos,
} from "@/lib/que-sigue-api";
import s from "./QueSigue.module.css";

export default function QueSigue({ token, onCambio }: { token: string; onCambio?: () => void }) {
  const router = useRouter();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [q, p] = await Promise.all([fetchQueSigue(token), fetchPendientes(token)]);
      setDatos(q);
      setPendientes(p.pendientes);
    } catch (e) {
      setError(formatApiError(e, "No se pudo cargar qué sigue"));
    }
  }, [token]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /** Corre una acción de un botón a la vez y vuelve a pedir la lista: lo hecho deja de sugerirse. */
  const correr = async (clave: string, accion: () => Promise<unknown>, porDefecto: string) => {
    setOcupado(clave);
    setError(null);
    try {
      await accion();
      await cargar();
      onCambio?.();
    } catch (e) {
      setError(formatApiError(e, porDefecto));
      await cargar();
    } finally {
      setOcupado(null);
    }
  };

  const arrancar = async (clave: string, accion: () => Promise<Arrancada>) => {
    setOcupado(clave);
    setError(null);
    try {
      const r = await accion();
      router.push(`/erp/actividades/${r.activityId}`);
    } catch (e) {
      setError(formatApiError(e, "No se pudo empezar"));
      await cargar();
      setOcupado(null);
    }
  };

  const agregar = (e: FormEvent) => {
    e.preventDefault();
    const limpio = texto.trim();
    if (!limpio) return;
    void correr(
      "agregar",
      async () => {
        await agregarPendiente(token, limpio);
        setTexto("");
      },
      "No se pudo guardar tu pendiente",
    );
  };

  if (!datos?.aplica) return error ? <Alert tone="danger">{error}</Alert> : null;
  const trabado = ocupado != null;

  return (
    <div className={s.dos}>
      <Card pad>
        <section className={s.bloque} aria-label="¿Qué sigue?">
          <h3 className={s.titulo}>¿Qué sigue?</h3>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <ul className={s.lista}>
            {datos.sugerencias.map((q) => (
              <li key={q.clave} className={s.fila}>
                <div className={s.texto}>
                  <strong>{q.titulo}</strong>
                  {q.detalle ? <small>{q.detalle}</small> : null}
                </div>
                {q.accion === "abrir" && q.href ? (
                  <Link href={q.href} className={s.abrir}>
                    Abrir
                  </Link>
                ) : (
                  <Button
                    size="sm"
                    variant={q.tipo === "fija" ? "secondary" : "primary"}
                    loading={ocupado === q.clave}
                    disabled={trabado}
                    onClick={() => void arrancar(q.clave, () => empezarSugerencia(token, q.clave))}
                  >
                    Empezar
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {datos.resumen ? <p className={s.nota}>{datos.resumen}</p> : null}
        </section>
      </Card>

      <Card pad>
        <section className={s.bloque} aria-label="Mis pendientes">
          <h3 className={s.titulo}>Mis pendientes</h3>
          <form className={s.agregar} onSubmit={agregar}>
            <Input
              aria-label="Nuevo pendiente"
              placeholder="Anota un pendiente…"
              value={texto}
              maxLength={200}
              onChange={(e) => setTexto(e.target.value)}
            />
            <Button type="submit" size="sm" loading={ocupado === "agregar"} disabled={trabado || !texto.trim()}>
              Agregar
            </Button>
          </form>
          {pendientes.length ? (
            <ul className={s.lista}>
              {pendientes.map((p) => (
                <li key={p.id} className={s.fila}>
                  <Checkbox
                    className={s.palomita}
                    label={p.texto}
                    disabled={trabado}
                    onChange={() => void correr(`hecho:${p.id}`, () => palomearPendiente(token, p.id), "No se pudo palomear")}
                  />
                  <div className={s.acciones}>
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={ocupado === `empezar:${p.id}`}
                      disabled={trabado}
                      onClick={() => void arrancar(`empezar:${p.id}`, () => empezarPendiente(token, p.id))}
                    >
                      Hacerla actividad
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Borrar ${p.texto}`}
                      disabled={trabado}
                      onClick={() => void correr(`borrar:${p.id}`, () => borrarPendiente(token, p.id), "No se pudo borrar")}
                    >
                      Borrar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className={s.nota}>Lo que anotes aquí solo lo ves tú. Palomea lo que ya hiciste, o hazlo actividad con un toque.</p>
          )}
        </section>
      </Card>
    </div>
  );
}
