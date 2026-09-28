"use client";

/**
 * Acceso a cuentas — solo el dueño (Christian).
 *
 * Vuelve a escribir su contraseña y, durante 5 minutos, puede restablecer la contraseña de cualquier
 * cuenta de la empresa; la nueva se muestra una sola vez para entregarla. La ficha vive solo en la
 * memoria de esta pantalla: al recargar o pasar los 5 minutos se vuelve a pedir la contraseña.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import InlineAlert from "@/components/ui/InlineAlert";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import {
  desbloquearCuentas,
  listarCuentas,
  puedeEntrarACuentas,
  restablecerContrasena,
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

const dias = (iso: string | null) => {
  if (!iso) return "sin cambios registrados";
  const d = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
  return d === 0 ? "cambiada hoy" : `cambiada hace ${d} ${d === 1 ? "día" : "días"}`;
};

export default function AccesoCuentasPage() {
  const { token } = useUser();
  const [permitido, setPermitido] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [ficha, setFicha] = useState<{ valor: string; venceEn: number } | null>(null);
  const [cuentas, setCuentas] = useState<CuentaEmpresa[] | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [confirmar, setConfirmar] = useState<number | null>(null);
  const [nueva, setNueva] = useState<ContrasenaNueva | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    if (!token) return;
    let cancelado = false;
    void puedeEntrarACuentas(token).then((v) => {
      if (!cancelado) setPermitido(v);
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
    setNueva(null);
    setConfirmar(null);
    setPassword("");
  }, []);

  useEffect(() => {
    if (ficha && ahora >= ficha.venceEn) {
      bloquear();
      setError("Pasaron 5 minutos: vuelve a escribir tu contraseña.");
    }
  }, [ahora, ficha, bloquear]);

  const desbloquear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !password || trabajando) return;
    setTrabajando(true);
    setError(null);
    try {
      const r = await desbloquearCuentas(token, password);
      setPassword("");
      setFicha({ valor: r.ficha, venceEn: new Date(r.venceEn).getTime() });
      setAhora(Date.now());
      setCuentas(await listarCuentas(token, r.ficha));
    } catch (err) {
      setPassword("");
      setError(err instanceof Error ? err.message : "No se pudo entrar.");
    } finally {
      setTrabajando(false);
    }
  };

  const restablecer = async (id: number) => {
    if (!token || !ficha || trabajando) return;
    setTrabajando(true);
    setError(null);
    try {
      setNueva(await restablecerContrasena(token, ficha.valor, id));
      setCopiado(false);
      setConfirmar(null);
      // La fecha de cambio de esa cuenta se actualiza en la lista.
      setCuentas(await listarCuentas(token, ficha.valor));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo restablecer la contraseña.");
    } finally {
      setTrabajando(false);
    }
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
        subtitle="Vuelve a escribir tu contraseña para poner una contraseña nueva a cualquier cuenta de la empresa."
        actions={
          ficha ? (
            <Button variant="ghost" onClick={bloquear}>
              Cerrar acceso ({Math.floor(restante / 60)}:{String(restante % 60).padStart(2, "0")})
            </Button>
          ) : undefined
        }
      />

      {error && <InlineAlert variant="danger" message={error} onDismiss={() => setError(null)} />}

      {!ficha ? (
        <form onSubmit={desbloquear} style={{ display: "grid", gap: 12, maxWidth: 420, marginTop: 16 }}>
          <label style={{ display: "grid", gap: 4, fontSize: 13, color: "var(--text-secondary)" }}>
            Tu contraseña
            <input
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
            El acceso dura 5 minutos. Cada entrada y cada restablecimiento quedan en la auditoría. El sistema no guarda las
            contraseñas de nadie: lo que haces aquí es poner una nueva y verla una sola vez.
          </p>
        </form>
      ) : (
        <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
          {nueva && (
            <div role="status" style={{ display: "grid", gap: 8, padding: 14, borderRadius: 14, border: "1px solid var(--state-success-border, var(--border))", background: "var(--state-success-bg, var(--surface-2))" }}>
              <strong>Contraseña nueva de {nueva.nombre}</strong>
              <div style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 18, letterSpacing: 0.5 }}>{nueva.password}</div>
              <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                Usuario: {nueva.email}. Se cerraron sus sesiones abiertas. <strong>Esta es la única vez que se muestra.</strong>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(`Usuario: ${nueva.email}\nContraseña: ${nueva.password}`);
                      setCopiado(true);
                    } catch {
                      setCopiado(false);
                    }
                  }}
                >
                  {copiado ? "Copiado ✓" : "Copiar usuario y contraseña"}
                </Button>
                <Button variant="ghost" onClick={() => setNueva(null)}>
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
            <p style={{ margin: 0, color: "var(--text-secondary)" }}>Cargando cuentas…</p>
          ) : filtradas.length === 0 ? (
            <p style={{ margin: 0, color: "var(--text-secondary)" }}>No hay cuentas que coincidan.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
              {filtradas.map((c) => (
                <li
                  key={c.id}
                  style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", padding: "10px 14px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)" }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>
                      {c.nombre} {!c.isActive && <span style={{ color: "var(--text-tertiary)", fontWeight: 500 }}>(inactiva)</span>}
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--text-secondary)", overflowWrap: "anywhere" }}>
                      {c.email} · {c.roleKey ?? "sin tipo"} · contraseña {dias(c.passwordChangedAt)}
                    </div>
                  </div>
                  {confirmar === c.id ? (
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12.5 }}>¿Poner una contraseña nueva y cerrar sus sesiones?</span>
                      <Button variant="primary" loading={trabajando} onClick={() => void restablecer(c.id)}>
                        Sí, restablecer
                      </Button>
                      <Button variant="ghost" onClick={() => setConfirmar(null)}>
                        Cancelar
                      </Button>
                    </div>
                  ) : (
                    <Button variant="secondary" onClick={() => setConfirmar(c.id)}>
                      Restablecer contraseña
                    </Button>
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
