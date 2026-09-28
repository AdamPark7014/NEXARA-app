"use client";

/**
 * «Dar de alta a alguien»: el botón y el formulario para quien tiene el permiso delegado
 * (Antonio: soporte · Luis: soporte · David: instaladores · Christian: todos los tipos de abajo).
 *
 * Solo aparece si el API le concedió al menos un tipo. La contraseña se escribe o se genera aquí y se
 * ve una sola vez (al terminar) para entregársela a la persona; el API la guarda solo como hash.
 */
import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import InlineAlert from "@/components/ui/InlineAlert";
import { useUser } from "@/components/UserContext";
import {
  contrasenaAceptable,
  crearUsuarioDelegado,
  generarContrasena,
  listarTiposCreables,
  type TipoUsuario,
  type UsuarioCreado,
} from "@/lib/delegated-users-api";

const campo = { display: "grid", gap: 4, fontSize: 13, color: "var(--text-secondary)" } as const;
const entrada = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text-primary)",
  fontSize: 16,
  minHeight: 44,
} as const;

export default function AltaUsuarioPanel() {
  const { token } = useUser();
  const [tipos, setTipos] = useState<TipoUsuario[] | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [roleKey, setRoleKey] = useState("");
  const [password, setPassword] = useState("");
  const [verPassword, setVerPassword] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creado, setCreado] = useState<{ usuario: UsuarioCreado; password: string; tipo: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelado = false;
    void listarTiposCreables(token).then((t) => {
      if (!cancelado) setTipos(t);
    });
    return () => {
      cancelado = true;
    };
  }, [token]);

  // Sin permiso (o mientras carga) no se muestra nada: el organigrama queda como siempre.
  if (!token || !tipos || tipos.length === 0) return null;

  const abrir = () => {
    setNombre("");
    setEmail("");
    setRoleKey(tipos.length === 1 ? tipos[0].roleKey : "");
    setPassword(generarContrasena());
    setVerPassword(false);
    setError(null);
    setCreado(null);
    setCopiado(false);
    setAbierto(true);
  };

  const valido = nombre.trim().length >= 3 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && roleKey !== "" && contrasenaAceptable(password);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valido || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const usuario = await crearUsuarioDelegado(token, { nombre: nombre.trim(), email: email.trim(), password, roleKey });
      setCreado({ usuario, password, tipo: tipos.find((t) => t.roleKey === roleKey)?.etiqueta ?? roleKey });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo dar de alta al usuario.");
    } finally {
      setEnviando(false);
    }
  };

  const copiar = async () => {
    if (!creado) return;
    const texto = `Usuario: ${creado.usuario.email}\nContraseña: ${creado.password}`;
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  };

  const etiquetaTipos = tipos.map((t) => t.etiqueta).join(", ");

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between", padding: "0 0 12px" }}>
        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          Puedes dar de alta personal de tipo: <strong style={{ color: "var(--text-primary)" }}>{etiquetaTipos}</strong>
        </span>
        <Button variant="primary" onClick={abrir}>
          Dar de alta a alguien
        </Button>
      </div>

      <Modal open={abierto} onClose={() => setAbierto(false)} title={creado ? "Usuario creado" : "Dar de alta a alguien"}>
        {creado ? (
          <div style={{ display: "grid", gap: 12 }}>
            <InlineAlert
              variant="success"
              message={`${creado.usuario.nombre} ya puede entrar como ${creado.tipo}. Queda debajo de ti en el organigrama.`}
            />
            <div style={{ display: "grid", gap: 6, padding: 12, borderRadius: 12, background: "var(--surface-2)", fontSize: 14 }}>
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Usuario: </span>
                <strong>{creado.usuario.email}</strong>
              </div>
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Contraseña: </span>
                <strong style={{ fontFamily: "var(--font-mono, monospace)" }}>{creado.password}</strong>
              </div>
            </div>
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
              Entrégasela a la persona en privado. <strong>Esta es la única vez que se muestra aquí</strong>: el sistema
              no la guarda de forma que se pueda volver a ver.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button variant="secondary" onClick={() => void copiar()}>
                {copiado ? "Copiado ✓" : "Copiar usuario y contraseña"}
              </Button>
              <Button variant="primary" onClick={() => setAbierto(false)}>
                Listo
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={enviar} style={{ display: "grid", gap: 12 }}>
            <label style={campo}>
              Nombre completo
              <input style={entrada} value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" required />
            </label>
            <label style={campo}>
              Correo
              <input style={entrada} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" required />
            </label>
            <label style={campo}>
              Tipo de usuario
              <select style={entrada} value={roleKey} onChange={(e) => setRoleKey(e.target.value)} required>
                <option value="" disabled>
                  Elige el tipo…
                </option>
                {tipos.map((t) => (
                  <option key={t.roleKey} value={t.roleKey}>
                    {t.etiqueta}
                  </option>
                ))}
              </select>
            </label>
            <label style={campo}>
              Contraseña
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  style={{ ...entrada, flex: 1, fontFamily: verPassword ? "var(--font-mono, monospace)" : undefined }}
                  type={verPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                <Button type="button" variant="ghost" onClick={() => setVerPassword((v) => !v)}>
                  {verPassword ? "Ocultar" : "Ver"}
                </Button>
                <Button type="button" variant="secondary" onClick={() => { setPassword(generarContrasena()); setVerPassword(true); }}>
                  Generar
                </Button>
              </div>
              <span style={{ fontSize: 12, color: password && !contrasenaAceptable(password) ? "var(--danger)" : "var(--text-tertiary)" }}>
                Al menos 8 caracteres, con letras y números.
              </span>
            </label>
            {error && <InlineAlert variant="danger" message={error} />}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <Button type="button" variant="ghost" onClick={() => setAbierto(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" loading={enviando} disabled={!valido || enviando}>
                Crear usuario
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
