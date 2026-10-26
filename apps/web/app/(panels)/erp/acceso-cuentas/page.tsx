"use client";

/**
 * Acceso a cuentas — solo el dueño (Christian).
 *
 * Vuelve a escribir su contraseña y, durante 5 minutos, puede ver la contraseña guardada de una cuenta
 * (cifrada en la bóveda del servidor; se oculta sola a los 30 s) o ponerle una nueva a cualquiera. La ficha
 * vive solo en la memoria de esta pantalla: al recargar o pasar los 5 minutos se vuelve a pedir la contraseña.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import InlineAlert from "@/components/ui/InlineAlert";
import EmptyState from "@/components/ui/EmptyState";
import css from "./acceso-cuentas.module.css";
import { useUser } from "@/components/UserContext";
import {
  desbloquearCuentas,
  estadoCuentas,
  listarCuentas,
  restablecerContrasena,
  revelarContrasena,
  type ContrasenaNueva,
  type CuentaEmpresa,
} from "@/lib/account-access-api";

const entrada = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text-primary)",
  fontSize: 16,
  minHeight: 44,
} as const;

/** Cuánto se queda visible una contraseña en pantalla. */
const VISIBLE_MS = 30_000;

const dias = (iso: string | null) => {
  if (!iso) return "sin cambios registrados";
  const d = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
  return d === 0 ? "cambiada hoy" : `cambiada hace ${d} ${d === 1 ? "día" : "días"}`;
};

type Mostrada = ContrasenaNueva & { esNueva: boolean };

export default function AccesoCuentasPage() {
  const { token } = useUser();
  const [permitido, setPermitido] = useState<boolean | null>(null);
  const [bovedaLista, setBovedaLista] = useState(true);
  const [password, setPassword] = useState("");
  const [ficha, setFicha] = useState<{ valor: string; venceEn: number } | null>(null);
  const [cuentas, setCuentas] = useState<CuentaEmpresa[] | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [confirmar, setConfirmar] = useState<number | null>(null);
  const [mostrada, setMostrada] = useState<Mostrada | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());
  const claveRef = useRef<HTMLInputElement>(null);
  const reintentoRef = useRef<
    | { tipo: "clave" }
    | { tipo: "lista" }
    | { tipo: "ver"; id: number }
    | { tipo: "restablecer"; id: number }
  >({ tipo: "clave" });

  useEffect(() => {
    if (!token) return;
    let cancelado = false;
    void estadoCuentas(token).then((e) => {
      if (cancelado) return;
      setPermitido(e.puedeEntrar);
      setBovedaLista(e.bovedaLista);
    });
    return () => {
      cancelado = true;
    };
  }, [token]);

  // Reloj para la cuenta regresiva y para cerrar sola la sesión a los 5 minutos.
  useEffect(() => {
    if (!ficha) return;
    const id = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [ficha]);

  const bloquear = useCallback(() => {
    setFicha(null);
    setCuentas(null);
    setMostrada(null);
    setConfirmar(null);
    setPassword("");
  }, []);

  useEffect(() => {
    if (ficha && ahora >= ficha.venceEn) {
      bloquear();
      setError("Pasaron 5 minutos: vuelve a escribir tu contraseña.");
      reintentoRef.current = { tipo: "clave" };
    }
  }, [ahora, ficha, bloquear]);

  // Una contraseña a la vista se oculta sola.
  useEffect(() => {
    if (!mostrada) return;
    const id = window.setTimeout(() => setMostrada(null), VISIBLE_MS);
    return () => window.clearTimeout(id);
  }, [mostrada]);

  const desbloquear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !password || trabajando) return;
    setTrabajando(true);
    setError(null);
    let entro = false;
    try {
      const r = await desbloquearCuentas(token, password);
      entro = true;
      setPassword("");
      setFicha({ valor: r.ficha, venceEn: new Date(r.venceEn).getTime() });
      setAhora(Date.now());
      setCuentas(await listarCuentas(token, r.ficha));
    } catch (err) {
      setPassword("");
      setError(err instanceof Error ? err.message : entro ? "No se pudieron cargar las cuentas." : "No se pudo entrar.");
      reintentoRef.current = entro ? { tipo: "lista" } : { tipo: "clave" };
    } finally {
      setTrabajando(false);
    }
  };

  const ver = async (id: number) => {
    if (!token || !ficha || trabajando) return;
    setTrabajando(true);
    setError(null);
    try {
      setMostrada({ ...(await revelarContrasena(token, ficha.valor, id)), esNueva: false });
      setCopiado(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo mostrar la contraseña.");
      reintentoRef.current = { tipo: "ver", id };
    } finally {
      setTrabajando(false);
    }
  };

  const restablecer = async (id: number) => {
    if (!token || !ficha || trabajando) return;
    setTrabajando(true);
    setError(null);
    try {
      setMostrada({ ...(await restablecerContrasena(token, ficha.valor, id)), esNueva: true });
      setCopiado(false);
      setConfirmar(null);
      // La fecha de cambio y el estado «guardada» de esa cuenta se actualizan en la lista.
      setCuentas(await listarCuentas(token, ficha.valor));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo restablecer la contraseña.");
      reintentoRef.current = { tipo: "restablecer", id };
    } finally {
      setTrabajando(false);
    }
  };

  const cargarLista = async () => {
    if (!token || !ficha || trabajando) return;
    setTrabajando(true);
    setError(null);
    try {
      setCuentas(await listarCuentas(token, ficha.valor));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar las cuentas.");
      reintentoRef.current = { tipo: "lista" };
    } finally {
      setTrabajando(false);
    }
  };

  const reintentar = () => {
    const accion = reintentoRef.current;
    if (accion.tipo === "ver") {
      void ver(accion.id);
      return;
    }
    if (accion.tipo === "restablecer") {
      void restablecer(accion.id);
      return;
    }
    if (accion.tipo === "lista") {
      void cargarLista();
      return;
    }
    setError(null);
    claveRef.current?.focus();
  };

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (cuentas ?? []).filter((c) => !q || c.nombre.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || (c.roleKey ?? "").includes(q));
  }, [cuentas, busqueda]);

  const restante = ficha ? Math.max(0, Math.ceil((ficha.venceEn - ahora) / 1000)) : 0;

  if (permitido === false) {
    return (
      <EmptyState icon="🔒" title="Solo para el dueño" description="Esta pantalla es de uso exclusivo de dirección general." />
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Gobierno · Seguridad"
        title="Acceso a cuentas"
        subtitle="Vuelve a escribir tu contraseña para ver la contraseña de una cuenta o ponerle una nueva."
        actions={
          ficha ? (
            <Button variant="ghost" onClick={bloquear}>
              Cerrar acceso ({Math.floor(restante / 60)}:{String(restante % 60).padStart(2, "0")})
            </Button>
          ) : undefined
        }
      />

      {error && (
        <InlineAlert
          variant="danger"
          message={error}
          onDismiss={() => setError(null)}
          action={
            <Button size="sm" variant="secondary" onClick={reintentar} disabled={trabajando}>
              {trabajando ? "Reintentando…" : "Reintentar"}
            </Button>
          }
        />
      )}
      {permitido && !bovedaLista && (
        <InlineAlert
          variant="warning"
          message="La bóveda no tiene llave de cifrado configurada en el servidor: por ahora no se guardan ni se muestran contraseñas. Puedes restablecerlas y entregarlas al momento."
        />
      )}

      {!ficha ? (
        <form onSubmit={desbloquear} style={{ display: "grid", gap: 12, maxWidth: 420, marginTop: 16 }}>
          <label style={{ display: "grid", gap: 4, fontSize: 13, color: "var(--text-secondary)" }}>
            Tu contraseña
            <input
              ref={claveRef}
              style={entrada}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              autoFocus
              required
            />
          </label>
          <Button type="submit" variant="primary" loading={trabajando} disabled={!password || trabajando || permitido !== true}>
            Entrar
          </Button>
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
            El acceso dura 5 minutos, cada entrada, cada contraseña que ves y cada restablecimiento quedan en la auditoría,
            y de las contraseñas cifradas solo se pueden ver las que se pusieron desde el sistema; a las anteriores ponles
            una nueva.
          </p>
        </form>
      ) : (
        <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
          {mostrada && (
            <div role="status" style={{ display: "grid", gap: 8, padding: 14, borderRadius: 14, border: "1px solid var(--state-success-border, var(--border))", background: "var(--state-success-bg, var(--surface-2))" }}>
              <strong>{mostrada.esNueva ? "Contraseña nueva de" : "Contraseña de"} {mostrada.nombre}</strong>
              <div style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 18, letterSpacing: 0.5, overflowWrap: "anywhere" }}>{mostrada.password}</div>
              <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                Usuario: {mostrada.email}.{" "}
                {mostrada.esNueva ? "Se cerraron sus sesiones abiertas. " : ""}
                Se oculta sola en 30 segundos.
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(`Usuario: ${mostrada.email}\nContraseña: ${mostrada.password}`);
                      setCopiado(true);
                    } catch {
                      setCopiado(false);
                    }
                  }}
                >
                  {copiado ? "Copiado ✓" : "Copiar usuario y contraseña"}
                </Button>
                <Button variant="ghost" onClick={() => setMostrada(null)}>
                  Ocultar
                </Button>
              </div>
            </div>
          )}

          <input
            style={{ ...entrada, maxWidth: 420 }}
            placeholder="Buscar por nombre, correo o tipo…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            aria-label="Buscar cuenta"
          />

          {cuentas === null ? (
            error ? null : <p style={{ margin: 0, color: "var(--text-secondary)" }}>Cargando cuentas…</p>
          ) : filtradas.length === 0 ? (
            <p style={{ margin: 0, color: "var(--text-secondary)" }}>
              {busqueda.trim() ? "Ninguna cuenta coincide." : "No hay cuentas."}
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
              {filtradas.map((c) => (
                <li key={c.id} className={css.cuenta}>
                  <div className={css.datos}>
                    <div className={css.nombre}>
                      {c.nombre} {!c.isActive && <span className={css.inactiva}>(inactiva)</span>}
                    </div>
                    <div className={css.meta}>
                      <span>{c.email}</span>
                      <span>
                        <span className={css.sep}> · </span>
                        {c.roleKey ?? "sin tipo"}
                      </span>
                      <span>
                        <span className={css.sep}> · </span>
                        contraseña {dias(c.passwordChangedAt)}
                      </span>
                      <span>
                        <span className={css.sep}> · </span>
                        {c.guardada ? "guardada" : "sin contraseña guardada"}
                      </span>
                    </div>
                  </div>
                  {confirmar === c.id ? (
                    <div className={css.confirmar}>
                      <span className={css.confirmarTexto}>¿Poner una contraseña nueva y cerrar sus sesiones?</span>
                      <div className={css.botones}>
                        <Button variant="primary" loading={trabajando} onClick={() => void restablecer(c.id)}>
                          Sí, restablecer
                        </Button>
                        <Button variant="ghost" onClick={() => setConfirmar(null)}>
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className={css.botones}>
                      {c.guardada && (
                        <Button variant="primary" loading={trabajando} onClick={() => void ver(c.id)}>
                          Ver contraseña
                        </Button>
                      )}
                      <Button variant="secondary" onClick={() => setConfirmar(c.id)}>
                        Restablecer contraseña
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
