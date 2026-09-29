"use client";

/**
 * Alta de usuarios en el organigrama.
 *
 * Solo aparece si el API dice `puede`: la persona tiene subordinados y dirección le concedió
 * algún tipo. Christian ve el formulario completo (cualquier rol de abajo, departamento y jefe).
 * David, Antonio y Luis ven el básico: nombre, correo, contraseña, teléfono y foto. El rol y el
 * jefe quedan fijos (el jefe es quien da de alta).
 *
 * La foto se recorta al centro, se guarda en `avatarUrl` y es la que ven la web y las apps.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import InlineAlert from "@/components/ui/InlineAlert";
import { useUser } from "@/components/UserContext";
import FotoPerfilCampo from "@/components/team/FotoPerfilCampo";
import { resolveUserAvatarUrl } from "@/lib/user-avatar";
import {
  cargarContextoAlta,
  contrasenaAceptable,
  crearUsuarioDelegado,
  editarPersonaEquipo,
  generarContrasena,
  type ContextoAlta,
  type PersonaEquipo,
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

const correoValido = (valor: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor.trim());
const telefonoValido = (valor: string) => valor.replace(/\D/g, "").length >= 10 && valor.trim().length <= 30;

export default function AltaUsuarioPanel() {
  const { token } = useUser();
  const router = useRouter();
  const [ctx, setCtx] = useState<ContextoAlta | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [roleKey, setRoleKey] = useState("");
  const [telefono, setTelefono] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [managerId, setManagerId] = useState("");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [password, setPassword] = useState("");
  const [verPassword, setVerPassword] = useState(false);
  const [foto, setFoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creado, setCreado] = useState<{ usuario: UsuarioCreado; password: string; tipo: string } | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [editando, setEditando] = useState<PersonaEquipo | null>(null);
  const [fotoEquipo, setFotoEquipo] = useState<File | null>(null);
  const [previewEquipo, setPreviewEquipo] = useState<string | null>(null);
  const [nombreEquipo, setNombreEquipo] = useState("");
  const [telefonoEquipo, setTelefonoEquipo] = useState("");
  const [roleKeyEquipo, setRoleKeyEquipo] = useState("");
  const [departmentIdEquipo, setDepartmentIdEquipo] = useState("");
  const [managerIdEquipo, setManagerIdEquipo] = useState("");
  const [employeeNumberEquipo, setEmployeeNumberEquipo] = useState("");
  const [errorEquipo, setErrorEquipo] = useState<string | null>(null);
  const [guardandoFoto, setGuardandoFoto] = useState(false);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    if (!token) return;
    let cancelado = false;
    void cargarContextoAlta(token).then((c) => {
      if (!cancelado) setCtx(c);
    });
    return () => {
      cancelado = true;
    };
  }, [token, recarga]);

  if (!token || !ctx || !ctx.puede || ctx.tipos.length === 0) return null;

  const completo = ctx.formulario === "completo";
  const rolFijo = ctx.rolAutomatico ? ctx.tipos[0] : null;

  const abrir = () => {
    setNombre("");
    setEmail("");
    setRoleKey(rolFijo?.roleKey ?? (ctx.tipos.length === 1 ? ctx.tipos[0].roleKey : ""));
    setTelefono("");
    setDepartmentId("");
    setManagerId("");
    setEmployeeNumber("");
    setPassword(generarContrasena());
    setVerPassword(false);
    setFoto(null);
    setPreview(null);
    setError(null);
    setCreado(null);
    setCopiado(false);
    setAbierto(true);
  };

  const rolElegido = rolFijo?.roleKey || roleKey;
  const telefonoOk = ctx.telefonoObligatorio ? telefonoValido(telefono) : telefono.trim() === "" || telefonoValido(telefono);
  const valido =
    nombre.trim().length >= 3 &&
    correoValido(email) &&
    rolElegido !== "" &&
    contrasenaAceptable(password) &&
    telefonoOk;

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valido || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const usuario = await crearUsuarioDelegado(token, {
        nombre: nombre.trim(),
        email: email.trim(),
        password,
        roleKey: rolElegido,
        telefono: telefono.trim() || undefined,
        departmentId: completo && departmentId ? Number(departmentId) : undefined,
        managerId: completo && managerId ? Number(managerId) : undefined,
        employeeNumber: completo && employeeNumber.trim() ? employeeNumber.trim() : undefined,
        foto,
      });
      setCreado({ usuario, password, tipo: ctx.tipos.find((t) => t.roleKey === rolElegido)?.etiqueta ?? rolElegido });
      setRecarga((n) => n + 1);
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

  const nombreEquipoOk = nombreEquipo.trim().length >= 3;
  const telefonoEquipoOk = telefonoEquipo.trim() === "" || telefonoValido(telefonoEquipo);

  const guardarEdicion = async () => {
    if (!editando || guardandoFoto || !nombreEquipoOk || !telefonoEquipoOk) return;
    setGuardandoFoto(true);
    setErrorEquipo(null);
    try {
      await editarPersonaEquipo(token, editando.id, {
        foto: fotoEquipo,
        nombre: nombreEquipo.trim(),
        telefono: telefonoEquipo.trim() || undefined,
        roleKey: completo && roleKeyEquipo ? roleKeyEquipo : undefined,
        departmentId: completo && departmentIdEquipo ? Number(departmentIdEquipo) : undefined,
        managerId: completo && managerIdEquipo ? Number(managerIdEquipo) : undefined,
        employeeNumber: completo && employeeNumberEquipo.trim() ? employeeNumberEquipo.trim() : undefined,
      });
      setEditando(null);
      setFotoEquipo(null);
      setPreviewEquipo(null);
      setRecarga((n) => n + 1);
    } catch (err) {
      setErrorEquipo(err instanceof Error ? err.message : "No se pudo guardar el cambio.");
    } finally {
      setGuardandoFoto(false);
    }
  };

  const etiquetaTipos = ctx.tipos.map((t) => t.etiqueta).join(", ");

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between", padding: "0 0 12px" }}>
        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          Puedes dar de alta personal de tipo: <strong style={{ color: "var(--text-primary)" }}>{etiquetaTipos}</strong>
        </span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant="secondary" onClick={() => router.push("/erp/my-profile")}>
            Mi perfil
          </Button>
          <Button variant="primary" onClick={abrir}>
            Dar de alta a alguien
          </Button>
        </div>
      </div>

      {ctx.equipo.length > 0 ? (
        <div style={{ display: "grid", gap: 8, padding: "0 0 16px" }}>
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            Perfiles de tu equipo. Edita foto, nombre y teléfono; la foto es la fija, la misma que se ve en actividades y en el celular.
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {ctx.equipo.map((p) => {
              const src = resolveUserAvatarUrl(p.avatarUrl);
              return (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span style={{ width: 40, height: 40, borderRadius: "50%", overflow: "hidden", background: "var(--surface-2)", flex: "0 0 auto" }}>
                    {src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : null}
                  </span>
                  <span style={{ fontSize: 13 }}>{p.nombre}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setEditando(p);
                      setFotoEquipo(null);
                      setPreviewEquipo(src || null);
                      setNombreEquipo(p.nombre);
                      setTelefonoEquipo(p.telefono ?? "");
                      setRoleKeyEquipo(p.roleKey ?? "");
                      setDepartmentIdEquipo(p.departmentId != null ? String(p.departmentId) : "");
                      setManagerIdEquipo(p.managerId != null ? String(p.managerId) : "");
                      setEmployeeNumberEquipo(p.employeeNumber ?? "");
                      setErrorEquipo(null);
                    }}
                  >
                    Editar
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <Modal open={abierto} onClose={() => setAbierto(false)} title={creado ? "Usuario creado" : "Dar de alta a alguien"}>
        {creado ? (
          <div style={{ display: "grid", gap: 12 }}>
            <InlineAlert
              variant="success"
              message={
                completo && managerId
                  ? `${creado.usuario.nombre} ya puede entrar como ${creado.tipo}.`
                  : `${creado.usuario.nombre} ya puede entrar como ${creado.tipo}. Queda debajo de ti en el organigrama.`
              }
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
            <FotoPerfilCampo
              previewUrl={preview}
              onChange={(file, url) => {
                setFoto(file);
                setPreview(url);
              }}
            />
            <label style={campo}>
              Nombre completo
              <input style={entrada} value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" required />
            </label>
            <label style={campo}>
              Correo
              <input style={entrada} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" required />
            </label>
            <label style={campo}>
              Teléfono
              <input
                style={entrada}
                inputMode="tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                autoComplete="off"
                required={ctx.telefonoObligatorio}
              />
            </label>
            {rolFijo ? (
              <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.45 }}>
                Rol y jefe quedan fijos: <strong style={{ color: "var(--text-primary)" }}>{rolFijo.etiqueta}</strong>, y te reporta a ti.
              </p>
            ) : (
              <label style={campo}>
                Tipo de usuario
                <select style={entrada} value={roleKey} onChange={(e) => setRoleKey(e.target.value)} required>
                  <option value="" disabled>
                    Elige el tipo…
                  </option>
                  {ctx.tipos.map((t) => (
                    <option key={t.roleKey} value={t.roleKey}>
                      {t.etiqueta}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {completo ? (
              <>
                <label style={campo}>
                  Departamento
                  <select style={entrada} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                    <option value="">El del área del rol</option>
                    {ctx.departamentos.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nombre}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={campo}>
                  Jefe
                  <select style={entrada} value={managerId} onChange={(e) => setManagerId(e.target.value)}>
                    <option value="">Tú</option>
                    {ctx.jefes.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.nombre}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={campo}>
                  Número de empleado
                  <input style={entrada} value={employeeNumber} onChange={(e) => setEmployeeNumber(e.target.value)} autoComplete="off" />
                </label>
              </>
            ) : null}
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

      <Modal open={editando != null} onClose={() => setEditando(null)} title={editando ? `Editar a ${editando.nombre}` : "Editar"}>
        <div style={{ display: "grid", gap: 12 }}>
          <FotoPerfilCampo
            previewUrl={previewEquipo}
            onChange={(file, url) => {
              setFotoEquipo(file);
              setPreviewEquipo(url);
            }}
          />
          <label style={campo}>
            Nombre completo
            <input style={entrada} value={nombreEquipo} onChange={(e) => setNombreEquipo(e.target.value)} autoComplete="off" required />
          </label>
          <label style={campo}>
            Teléfono
            <input style={entrada} inputMode="tel" value={telefonoEquipo} onChange={(e) => setTelefonoEquipo(e.target.value)} autoComplete="off" />
          </label>
          {completo ? (
            <>
              <label style={campo}>
                Tipo de usuario
                <select style={entrada} value={roleKeyEquipo} onChange={(e) => setRoleKeyEquipo(e.target.value)}>
                  <option value="">Sin cambio</option>
                  {ctx.tipos.map((t) => (
                    <option key={t.roleKey} value={t.roleKey}>
                      {t.etiqueta}
                    </option>
                  ))}
                </select>
              </label>
              <label style={campo}>
                Departamento
                <select style={entrada} value={departmentIdEquipo} onChange={(e) => setDepartmentIdEquipo(e.target.value)}>
                  <option value="">Sin cambio</option>
                  {ctx.departamentos.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label style={campo}>
                Jefe
                <select style={entrada} value={managerIdEquipo} onChange={(e) => setManagerIdEquipo(e.target.value)}>
                  <option value="">Sin cambio</option>
                  {ctx.jefes.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label style={campo}>
                Número de empleado
                <input style={entrada} value={employeeNumberEquipo} onChange={(e) => setEmployeeNumberEquipo(e.target.value)} autoComplete="off" />
              </label>
            </>
          ) : null}
          {errorEquipo ? <InlineAlert variant="danger" message={errorEquipo} /> : null}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button type="button" variant="ghost" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              loading={guardandoFoto}
              disabled={guardandoFoto || !nombreEquipoOk || !telefonoEquipoOk}
              onClick={() => void guardarEdicion()}
            >
              Guardar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
