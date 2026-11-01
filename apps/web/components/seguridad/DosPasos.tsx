"use client";

import { useCallback, useEffect, useState } from "react";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import InlineAlert from "@/components/ui/InlineAlert";
import { buildApiUrl } from "@/lib/api-base";
import s from "./DosPasos.module.css";

type Estado = { mfaEnabled: boolean; mfaEnabledAt?: string | null };
type Configuracion = { secret: string; otpauthUrl: string; qrDataUrl?: string };

async function api<T>(path: string, token: string, body?: unknown): Promise<T> {
  const res = await fetch(buildApiUrl(path), {
    method: body === undefined ? "GET" : "POST",
    credentials: "include",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const texto = await res.text();
  const data = texto ? JSON.parse(texto) : null;
  if (!res.ok) {
    const msg = Array.isArray(data?.message) ? data.message.join(" ") : data?.message;
    throw new Error(typeof msg === "string" && msg ? msg : `Error ${res.status}`);
  }
  return data as T;
}

/** `JBSWY3DP EHPK3PXP …`: más fácil de copiar a mano. */
const enBloques = (secreto: string) => secreto.replace(/(.{4})/g, "$1 ").trim();
const soloDigitos = (v: string) => v.replace(/\D/g, "").slice(0, 6);
const fecha = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", year: "numeric" });

/**
 * Verificación en dos pasos (TOTP) de la propia cuenta: activar con QR, confirmar con un código y
 * desactivar con un código. Las apps de celular todavía no piden el código al entrar.
 */
export default function DosPasos({ token }: { token: string }) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [config, setConfig] = useState<Configuracion | null>(null);
  const [codigo, setCodigo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const cargar = useCallback(async () => {
    if (!token) return;
    try {
      setEstado(await api<Estado>("users/mfa/status", token));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el estado.");
    }
  }, [token]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const accion = async (fn: () => Promise<void>) => {
    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Algo falló; inténtalo de nuevo.");
    } finally {
      setOcupado(false);
    }
  };

  const empezar = () =>
    accion(async () => {
      setConfig(await api<Configuracion>("users/mfa/setup", token, {}));
      setCodigo("");
    });

  const activar = () =>
    accion(async () => {
      await api("users/mfa/confirm", token, { token: codigo });
      setConfig(null);
      setCodigo("");
      setAviso("Listo: la próxima vez que entres te pediremos el código de tu app.");
      await cargar();
    });

  const desactivar = () =>
    accion(async () => {
      await api("users/mfa/disable", token, { token: codigo });
      setCodigo("");
      setAviso("Desactivaste la verificación en dos pasos.");
      await cargar();
    });

  const copiar = async () => {
    if (!config) return;
    try {
      await navigator.clipboard.writeText(config.secret);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* el navegador no dejó copiar: el texto sigue visible */
    }
  };

  const activo = Boolean(estado?.mfaEnabled);

  return (
    <Section
      title="Verificación en dos pasos"
      subtitle="Además de tu contraseña, un código de 6 dígitos de Google Authenticator o Microsoft Authenticator."
    >
      <div className={s.cuerpo}>
        <div className={s.estado} data-activo={activo ? "si" : "no"}>
          <span className={s.punto} aria-hidden="true" />
          <span>
            {estado == null
              ? "Revisando…"
              : activo
                ? `Activa${estado.mfaEnabledAt ? ` desde el ${fecha.format(new Date(estado.mfaEnabledAt))}` : ""}`
                : "Desactivada"}
          </span>
        </div>

        {!activo && !config && estado != null && (
          <>
            <p className={s.texto}>
              Si alguien obtiene tu contraseña, sin tu celular no podrá entrar. Tarda un minuto.
            </p>
            <p className={s.nota}>
              La app de NEXARA en el celular todavía no pide el código: si entras ahí, mantén abierta tu sesión
              actual antes de activarla.
            </p>
            <div>
              <Button variant="primary" onClick={() => void empezar()} loading={ocupado}>
                Activar verificación en dos pasos
              </Button>
            </div>
          </>
        )}

        {!activo && config && (
          <div className={s.pasos}>
            <ol className={s.lista}>
              <li>Abre Google Authenticator o Microsoft Authenticator y toca «Agregar».</li>
              <li>Escanea este código. Si estás en el celular, usa el botón o escribe la clave.</li>
              <li>Escribe el código de 6 dígitos que te muestra la app.</li>
            </ol>
            <div className={s.qrFila}>
              {config.qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- data URL generada por la API
                <img className={s.qr} src={config.qrDataUrl} alt="Código QR para tu app de autenticación" width={200} height={200} />
              ) : null}
              <div className={s.clave}>
                <span className={s.claveEtiqueta}>Clave para escribir a mano</span>
                <code className={s.claveValor}>{enBloques(config.secret)}</code>
                <div className={s.claveAcciones}>
                  <Button size="sm" onClick={() => void copiar()}>
                    {copiado ? "Copiada" : "Copiar clave"}
                  </Button>
                  <a className={s.enlaceApp} href={config.otpauthUrl}>
                    Abrir en la app del celular
                  </a>
                </div>
              </div>
            </div>
            <form
              className={s.codigoFila}
              onSubmit={(e) => {
                e.preventDefault();
                void activar();
              }}
            >
              <label className={s.codigoEtiqueta} htmlFor="mfa-codigo-activar">
                Código de 6 dígitos
              </label>
              <input
                id="mfa-codigo-activar"
                className={s.codigo}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                value={codigo}
                onChange={(e) => setCodigo(soloDigitos(e.target.value))}
              />
              <Button type="submit" variant="primary" loading={ocupado} disabled={codigo.length !== 6}>
                Activar
              </Button>
              <Button type="button" variant="ghost" onClick={() => setConfig(null)} disabled={ocupado}>
                Cancelar
              </Button>
            </form>
          </div>
        )}

        {activo && (
          <form
            className={s.codigoFila}
            onSubmit={(e) => {
              e.preventDefault();
              void desactivar();
            }}
          >
            <label className={s.codigoEtiqueta} htmlFor="mfa-codigo-desactivar">
              Para desactivarla, escribe un código de tu app
            </label>
            <input
              id="mfa-codigo-desactivar"
              className={s.codigo}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              value={codigo}
              onChange={(e) => setCodigo(soloDigitos(e.target.value))}
            />
            <Button type="submit" variant="danger" loading={ocupado} disabled={codigo.length !== 6}>
              Desactivar
            </Button>
          </form>
        )}

        {activo && (
          <p className={s.nota}>¿Perdiste el celular? Pide a un administrador que te quite la verificación desde Usuarios.</p>
        )}

        {aviso && <InlineAlert variant="success" message={aviso} onDismiss={() => setAviso(null)} />}
        {error && <InlineAlert variant="danger" message={error} onDismiss={() => setError(null)} />}
      </div>
    </Section>
  );
}
