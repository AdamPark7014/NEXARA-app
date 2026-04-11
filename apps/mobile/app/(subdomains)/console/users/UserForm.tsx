"use client";
import React, { useEffect, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import Slider from "@mui/material/Slider";
import Modal from "@mui/material/Modal";
import { useSearchParams } from "next/navigation";
import getCroppedImg from "./cropImageUtil";
import Image from "next/image";
import { useUser } from '@/components/UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';
import { createUser } from "./api";
import { appendAvatarToFormData, resolveUserAvatarUrl } from '@/lib/user-avatar';
import { buildApiUrl } from '@/lib/api-base';


// Extiende el tipo de initialUser para que su role incluya los campos de acceso
export type UserRole = {
  id: number;
  nombre: string;
  superadmin?: boolean;
  accesoConsole?: boolean;
  accesoConsoleAdmin?: boolean;
  accesoGestionWeb?: boolean;
  accesoGestionCvs?: boolean;
  accesoPanelVentas?: boolean;
  accesoContabilidad?: boolean;
  accesoCotizaciones?: boolean;
};

export type UserFormInitialUser = {
  id?: number;
  nombre?: string;
  email?: string;
  employeeNumber?: string;
  role?: UserRole;
  department?: { id?: number; nombre: string };
  avatarUrl?: string;
};

type RoleTipo = "vendedor" | "ingeniero" | "administrador";

type FormState = {
  nombre: string;
  email: string;
  employeeNumber: string;
  password: string;
  departmentId: string;
  department: string;
  avatarUrl: string;
  roleTipo: RoleTipo;
  cargo: string;
  roleNombre: string;
  accesoPanelVentas: boolean;
  accesoGestionWeb: boolean;
  accesoGestionCvs: boolean;
  accesoContabilidad: boolean;
  accesoCotizaciones: boolean;
};

const DEFAULT_ROLE_LABEL: Record<RoleTipo, string> = {
  vendedor: "Vendedor",
  ingeniero: "Usuario consola",
  administrador: "Admin consola",
};

const EMAIL_DOMAIN = "nexara.com.mx";
const EMPLOYEE_NUMBER_PREFIX = "NXR25SYS";
const EMAIL_JOINER_STOPWORDS = new Set(["de", "del", "la", "las", "los", "y"]);

const normalizeEmailToken = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, " ")
  .trim();

const suggestConsoleEmail = (name: string) => {
  const tokens = normalizeEmailToken(name).split(/\s+/).filter(Boolean);
  if (!tokens.length) return "";
  const [firstToken, ...restTokens] = tokens;
  const compactRest = restTokens.filter((token) => !EMAIL_JOINER_STOPWORDS.has(token)).join("");
  const localPart = [firstToken, compactRest].filter(Boolean).join(".");
  return `${localPart || firstToken}@${EMAIL_DOMAIN}`;
};

const formatEmployeeNumberFromId = (id: number) => `${EMPLOYEE_NUMBER_PREFIX}${String(Math.max(1, id)).padStart(3, "0")}`;

const createPasswordSeed = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%";
  if (typeof globalThis !== "undefined" && globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(6);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  }
  return Math.random().toString(36).slice(-6);
};

const buildSuggestedPassword = (name: string, employeeNumber?: string, seed = "") => {
  const token = normalizeEmailToken(name).split(/\s+/).filter(Boolean)[0] || "nexara";
  const readable = `${token.charAt(0).toUpperCase()}${token.slice(1, 10)}`;
  const numericSuffix = String(employeeNumber || "").replace(/\D/g, "").slice(-3);
  const fallbackSuffix = `${new Date().getMonth() + 1}${new Date().getDate()}`.padStart(4, "0");
  return `${readable}@${numericSuffix || fallbackSuffix}${seed}`;
};

const resolveRoleTipo = (initialUser: UserFormInitialUser | undefined, roleName: string): RoleTipo => {
  const initialRoleLower = roleName.toLowerCase();
  if (initialUser?.role?.accesoConsoleAdmin) return "administrador";
  if (initialUser?.role?.accesoConsole) return "ingeniero";
  if (initialRoleLower.includes("admin")) return "administrador";
  if (initialRoleLower.includes("ingenier") || initialRoleLower.includes("consola")) return "ingeniero";
  return "vendedor";
};

const resolveRoleName = (roleTipo: RoleTipo, cargo: string) => {
  if (roleTipo === "vendedor") return DEFAULT_ROLE_LABEL.vendedor;
  const trimmedCargo = cargo.trim();
  return trimmedCargo || DEFAULT_ROLE_LABEL[roleTipo];
};

const applyRoleConstraints = (state: FormState): FormState => {
  const next = { ...state };

  if (next.roleTipo === "vendedor") {
    next.cargo = "";
    next.accesoPanelVentas = true;
  }

  return next;
};

export default function UserForm({
  onUserCreated,
  onUserUpdated,
  initialUser,
  isEdit = false,
  showHeader = true,
}: {
  onUserCreated?: () => void;
  onUserUpdated?: (formData: FormData, id: number) => void;
  initialUser?: UserFormInitialUser;
  isEdit?: boolean;
  showHeader?: boolean;
}) {
  const { user } = useUser();
  const searchParams = useSearchParams();
  
  const getFullImageUrl = (url: string | undefined) => resolveUserAvatarUrl(url);

  const prefillName = searchParams.get('prefillName') || '';
  const prefillEmail = searchParams.get('prefillEmail') || '';
  const prefillRole = searchParams.get('prefillRoleName') || '';
  const initialRoleName = String(initialUser?.role?.nombre || (!isEdit ? prefillRole : "")).trim() || "Vendedor";
  const initialRoleTipo = resolveRoleTipo(initialUser, initialRoleName);
  const initialRoleLower = initialRoleName.toLowerCase();
  const initialCargo = initialRoleTipo === "vendedor" || initialRoleLower === initialRoleTipo || initialRoleName === DEFAULT_ROLE_LABEL[initialRoleTipo]
    ? ""
    : initialRoleName;

  const [form, setForm] = useState<FormState>(() => applyRoleConstraints({
    nombre: initialUser?.nombre || (!isEdit ? prefillName : ""),
    email: initialUser?.email || (!isEdit ? prefillEmail : ""),
    employeeNumber: initialUser?.employeeNumber || "",
    password: "",
    departmentId: initialUser?.department?.id ? String(initialUser.department.id) : "",
    department: initialUser?.department?.nombre || "",
    avatarUrl: initialUser?.avatarUrl || "",
    roleTipo: initialRoleTipo,
    cargo: initialCargo,
    // Rol visible editable libremente
    roleNombre: initialRoleName,
    accesoPanelVentas: initialUser?.role?.accesoPanelVentas || initialRoleTipo === "vendedor",
    accesoGestionWeb: initialUser?.role?.accesoGestionWeb || false,
    accesoGestionCvs: initialUser?.role?.accesoGestionCvs || false,
    accesoContabilidad: initialUser?.role?.accesoContabilidad || false,
    accesoCotizaciones: initialUser?.role?.accesoCotizaciones || false,
  }));
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarRemoved, setAvatarRemoved] = useState(false);

  // ...existing code...

  const [preview, setPreview] = useState<string>(getFullImageUrl(initialUser?.avatarUrl));
  const [cropModal, setCropModal] = useState(false);
  const [cropImage, setCropImage] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<{ width: number; height: number; x: number; y: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [employeeNumberPreview, setEmployeeNumberPreview] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailManuallyEdited, setEmailManuallyEdited] = useState(Boolean(initialUser?.email || (!isEdit ? prefillEmail : "")));
  const [passwordManuallyEdited, setPasswordManuallyEdited] = useState(false);
  const [passwordSeed] = useState(() => createPasswordSeed());
  const fileInput = useRef<HTMLInputElement>(null);
  const canAssignConsoleRoles = Boolean(user?.isSuperAdmin);

  const loadNextEmployeeNumber = async () => {
    if (isEdit || !user?.token) return;
    try {
      let nextValue = "";
      const res = await fetch(buildApiUrl('users/next-employee-number'), {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (res.ok) {
        const payload = await res.json();
        nextValue = String(payload?.employeeNumber || '').trim();
      }
      if (!nextValue) {
        const usersRes = await fetch(buildApiUrl('users?limit=5000'), {
          headers: { Authorization: `Bearer ${user.token}` },
        });
        if (usersRes.ok) {
          const usersPayload = await usersRes.json();
          const users = Array.isArray(usersPayload)
            ? usersPayload
            : Array.isArray(usersPayload?.data)
              ? usersPayload.data
              : Array.isArray(usersPayload?.items)
                ? usersPayload.items
                : [];
          const maxId = users.reduce((highest: number, item: any) => Math.max(highest, Number(item?.id) || 0), 0);
          nextValue = formatEmployeeNumberFromId(maxId + 1);
        }
      }
      if (nextValue) {
        setEmployeeNumberPreview(nextValue);
        setForm((prev) => {
          const resolvedEmployeeNumber = prev.employeeNumber || nextValue;
          return {
            ...prev,
            employeeNumber: resolvedEmployeeNumber,
            password: !passwordManuallyEdited && !prev.password
              ? buildSuggestedPassword(prev.nombre, resolvedEmployeeNumber, passwordSeed)
              : prev.password,
          };
        });
      }
    } catch {
      setForm((prev) => ({
        ...prev,
        password: !passwordManuallyEdited && !prev.password
          ? buildSuggestedPassword(prev.nombre, prev.employeeNumber || employeeNumberPreview, passwordSeed)
          : prev.password,
      }));
    }
  };

  useEffect(() => {
    void loadNextEmployeeNumber();
  }, [isEdit, user?.token]);

  if (!user || !hasPermission(user, PERMISSIONS.USERS_MANAGE)) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const target = e.target as HTMLInputElement;
    const { name, value, type } = target;
    const nextValue = type === "checkbox" ? target.checked : value;
    if (name === "email") {
      setEmailManuallyEdited(true);
    }
    if (name === "password") {
      setPasswordManuallyEdited(true);
    }
    setForm((prev) => {
      let nextForm = {
        ...prev,
        [name]: name === "roleTipo" ? (nextValue as RoleTipo) : nextValue,
      } as FormState;
      if (name === "nombre" && !isEdit && !emailManuallyEdited) {
        nextForm = { ...nextForm, email: suggestConsoleEmail(String(nextValue || "")) };
      }
      if (!isEdit && !passwordManuallyEdited && (name === "nombre" || name === "employeeNumber")) {
        const suggestedEmployeeNumber = name === "employeeNumber"
          ? String(nextValue || "")
          : String(nextForm.employeeNumber || employeeNumberPreview || "");
        const suggestedName = name === "nombre" ? String(nextValue || "") : String(nextForm.nombre || "");
        nextForm = { ...nextForm, password: buildSuggestedPassword(suggestedName, suggestedEmployeeNumber, passwordSeed) };
      }
      // Si cambia el nombre del departamento, limpiar el ID para que el nombre tenga efecto
      if (name === "department") {
        nextForm = { ...nextForm, departmentId: "" };
      }
      return applyRoleConstraints(nextForm);
    });
  };

  const validateImage = (file: File) => {
    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    const maxSize = 2 * 1024 * 1024; // 2MB
    if (!validTypes.includes(file.type)) {
      alert("Solo se permiten imágenes JPG, PNG o WEBP");
      return false;
    }
    if (file.size > maxSize) {
      alert("La imagen debe ser menor a 2MB");
      return false;
    }
    return true;
  };

  const openCropper = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setCropImage(reader.result as string);
      setCropModal(true);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (!validateImage(file)) return;
      openCropper(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!validateImage(file)) return;
      openCropper(file);
    }
  };

  const onCropComplete = (_: unknown, croppedAreaPixels: { width: number; height: number; x: number; y: number }) => {
    setCroppedAreaPixels(croppedAreaPixels);
  };

  const handleCropSave = async () => {
    if (!cropImage || !croppedAreaPixels) return;
    const cropped = await getCroppedImg(cropImage, croppedAreaPixels);
    setAvatarFile(cropped.file);
    setAvatarRemoved(false);
    setPreview(cropped.url);
    setCropModal(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const normalizedRoleTipo: RoleTipo = canAssignConsoleRoles ? form.roleTipo : "vendedor";
      const effectiveRoleName = form.roleNombre.trim() || resolveRoleName(normalizedRoleTipo, form.cargo);
      const accesoPanelVentas = normalizedRoleTipo === "vendedor" ? true : Boolean(form.accesoPanelVentas);
      const accesoGestionWeb = normalizedRoleTipo === "administrador" ? true : Boolean(form.accesoGestionWeb);
      const accesoContabilidad = normalizedRoleTipo === "administrador" ? true : Boolean(form.accesoContabilidad);

      // Construir el payload de rol según la nueva lógica
      const rolePayload = {
        nombre: effectiveRoleName,
        accesoConsole: normalizedRoleTipo !== "vendedor",
        accesoConsoleAdmin: normalizedRoleTipo === "administrador",
        accesoActividades: normalizedRoleTipo !== "vendedor",
        accesoEvidencias: normalizedRoleTipo !== "vendedor",
        accesoViaticos: normalizedRoleTipo !== "vendedor",
        accesoVehiculos: normalizedRoleTipo !== "vendedor",
        accesoAsistencia: normalizedRoleTipo !== "vendedor",
        accesoGps: normalizedRoleTipo !== "vendedor",
        accesoGestionUsuarios: normalizedRoleTipo === "administrador",
        accesoGestionWeb,
        accesoGestionCvs: form.accesoGestionCvs,
        accesoPanelVentas,
        accesoContabilidad,
        accesoCotizaciones: form.accesoCotizaciones,
        accesoInventario: normalizedRoleTipo === "administrador",
        accesoCompras: normalizedRoleTipo === "administrador",
        accesoSeguridad: normalizedRoleTipo === "administrador",
        accesoDocumentos: normalizedRoleTipo === "administrador",
        accesoWorkflow: normalizedRoleTipo === "administrador",
        accesoAuditoria: normalizedRoleTipo === "administrador",
        accesoBI: normalizedRoleTipo === "administrador",
        accesoBanca: normalizedRoleTipo === "administrador",
      };

      const getErrorMessage = async (res: Response, fallback: string) => {
        try {
          const data = await res.json();
          if (Array.isArray(data?.message) && data.message.length) {
            return String(data.message[0]);
          }
          if (typeof data?.message === 'string' && data.message.trim()) {
            return data.message;
          }
        } catch {
          // non-JSON body
        }
        return fallback;
      };

      const fetchRoleByName = async () => {
        const listRes = await fetch(buildApiUrl('roles'), {
          headers: {
            'Content-Type': 'application/json',
            ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
          },
        });
        if (!listRes.ok) {
          throw new Error(await getErrorMessage(listRes, 'Error al cargar roles'));
        }
        const roles = await listRes.json();
        const normalizedName = effectiveRoleName.trim().toLowerCase();
        return Array.isArray(roles)
          ? roles.find((r) => String(r?.nombre || '').trim().toLowerCase() === normalizedName)
          : null;
      };

      // Resolver rol para asignar al usuario en edición/creación.
      // Se reutiliza el rol existente por nombre y solo se crea uno nuevo cuando no existe.
      let roleId: number | null = null;
      if (effectiveRoleName) {
        const existing = await fetchRoleByName();
        if (existing?.id) {
          roleId = existing.id;
        } else {
          const roleRes = await fetch(buildApiUrl('roles'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
            },
            body: JSON.stringify(rolePayload),
          });
          if (roleRes.ok) {
            const roleData = await roleRes.json();
            roleId = roleData.id;
          } else if (roleRes.status === 409) {
            const again = await fetchRoleByName();
            if (again?.id) {
              roleId = again.id;
            } else {
              throw new Error(await getErrorMessage(roleRes, 'Ya existe un rol con ese nombre.'));
            }
          } else {
            throw new Error(await getErrorMessage(roleRes, 'Error al crear el rol'));
          }
        }
      }
      if (!roleId) {
        throw new Error('No se pudo resolver el rol para el usuario');
      }

      // Crear/actualizar el usuario con el roleId resuelto.
      const data = new FormData();
      data.append("nombre", form.nombre);
      data.append("email", form.email);
      data.append("employeeNumber", form.employeeNumber.trim() || employeeNumberPreview);
      if (form.password) data.append("password", form.password);
      data.append("roleId", String(roleId));
      const resolvedDepartment = (form.departmentId || "").trim() || (form.department || "").trim();
      if (resolvedDepartment) {
        data.append("departmentId", resolvedDepartment);
      }
      appendAvatarToFormData(data, avatarFile, avatarRemoved);
      if (isEdit && initialUser?.id) {
        if (onUserUpdated) await onUserUpdated(data, initialUser.id);
      } else {
        await createUser(data, user?.token);
        if (onUserCreated) onUserCreated();
        alert("Usuario creado correctamente");
        setForm(applyRoleConstraints({
          nombre: "",
          email: "",
          employeeNumber: "",
          password: "",
          departmentId: "",
          department: "",
          avatarUrl: "",
          roleTipo: "vendedor",
          cargo: "",
          roleNombre: DEFAULT_ROLE_LABEL.vendedor,
          accesoPanelVentas: true,
          accesoGestionWeb: false,
          accesoGestionCvs: false,
          accesoContabilidad: false,
          accesoCotizaciones: false,
        }));
        setEmailManuallyEdited(false);
        setPasswordManuallyEdited(false);
        setAvatarFile(null);
        setAvatarRemoved(false);
        setPreview("");
        await loadNextEmployeeNumber();
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        alert(err.message || "Error al crear usuario");
      } else {
        alert("Error al crear usuario");
      }
    }
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className={`userForm ${showHeader ? "" : "userFormCompact"}`}>
      {showHeader && (
        <div className="formHeader">
          <div>
            <h3 className="formTitle">{isEdit ? "Editar Usuario" : "Crear Usuario"}</h3>
            <p className="formSubtitle">Gestiona datos, permisos y fotografia del perfil.</p>
          </div>
          {user?.isSuperAdmin && <span className="formBadge">Superadmin</span>}
        </div>
      )}

      <div className="formGrid">
        <div className="field">
          <label className="label">Nombre</label>
          <input name="nombre" value={form.nombre} onChange={handleChange} required className="input" />
        </div>
        <div className="field">
          <label className="label">Email</label>
          <input name="email" type="email" value={form.email} onChange={handleChange} required className="input" />
          <span className="helperText">Se sugiere automaticamente con el dominio nexara.com.mx y puedes editarlo antes de guardar.</span>
        </div>
        <div className="field">
          <label className="label">Numero de empleado</label>
          <input name="employeeNumber" value={form.employeeNumber || employeeNumberPreview} onChange={handleChange} className="input" />
          <span className="helperText">Se precarga con el patron NXR25SYS### y puedes editarlo antes de guardar.</span>
        </div>
        <div className="field fieldWide">
          <label className="label">Contraseña</label>
          <div className="inputRow">
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={handleChange}
              className="input"
              placeholder={isEdit ? "Dejar en blanco para no cambiar" : "Nueva contraseña"}
              required={!isEdit}
            />
            <button
              type="button"
              className="ghostButton passwordToggleButton"
              onClick={() => setShowPassword((prev) => !prev)}
            >
              {showPassword ? "Ocultar" : "Ver"}
            </button>
          </div>
          {isEdit && (
            <span className="helperText">
              La contraseña actual no se puede precargar porque se almacena cifrada. Si necesitas cambiarla, escribe una nueva y usa Ver para revisarla antes de guardar.
            </span>
          )}
        </div>
        <div className="field">
          <label className="label">Tipo de rol</label>
          <select name="roleTipo" value={form.roleTipo} onChange={handleChange} className="input">
            <option value="vendedor">Vendedor</option>
            {!canAssignConsoleRoles && form.roleTipo === "ingeniero" && <option value="ingeniero">Consola usuario</option>}
            {!canAssignConsoleRoles && form.roleTipo === "administrador" && <option value="administrador">Consola admin</option>}
            {canAssignConsoleRoles && <option value="ingeniero">Consola usuario</option>}
            {canAssignConsoleRoles && <option value="administrador">Consola admin</option>}
          </select>
          {!canAssignConsoleRoles && (
            <span className="helperText">Solo superadmin puede asignar roles de consola.</span>
          )}
        </div>
        {form.roleTipo !== "vendedor" && (
          <div className="field fieldWide">
            <label className="label">Cargo personalizado (opcional)</label>
            <input
              name="cargo"
              value={form.cargo}
              onChange={handleChange}
              className="input"
              placeholder="Ej: Coordinador de Operaciones"
            />
          </div>
        )}
        <div className="field">
          <label className="label">Nombre visible del rol</label>
          <input
            name="roleNombre"
            value={form.roleNombre}
            onChange={handleChange}
            className="input"
            placeholder="Ej: Supervisor de Operaciones"
          />
        </div>
        <div className="field">
          <label className="label">Departamento</label>
          <input name="department" value={form.department} onChange={handleChange} className="input" />
        </div>
      </div>

      <div className="field fieldSection">
        <label className="label">Accesos permitidos</label>
        <div className="checkboxGrid">
          <label className="checkboxItem"><input type="checkbox" name="accesoGestionWeb" checked={form.accesoGestionWeb} onChange={handleChange} /> <span>Panel Web</span></label>
          <label className="checkboxItem"><input type="checkbox" name="accesoGestionCvs" checked={form.accesoGestionCvs} onChange={handleChange} /> <span>Gestion de CVs</span></label>
          <label className="checkboxItem"><input type="checkbox" name="accesoPanelVentas" checked={form.accesoPanelVentas} onChange={handleChange} /> <span>Panel Ventas</span></label>
          {user?.isSuperAdmin && <label className="checkboxItem"><input type="checkbox" name="accesoContabilidad" checked={form.accesoContabilidad} onChange={handleChange} /> <span>Panel Contabilidad</span></label>}
          <label className="checkboxItem"><input type="checkbox" name="accesoCotizaciones" checked={form.accesoCotizaciones} onChange={handleChange} /> <span>Pestana de cotizaciones</span></label>
        </div>
      </div>

      <div className="field fieldSection">
        <label className="label">Foto de usuario</label>
        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onDragEnter={e => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={e => {
            e.preventDefault();
            setDragActive(false);
          }}
          className={`dropZone ${dragActive ? 'dropZoneActive' : ''}`}
          onClick={() => fileInput.current?.click()}
          style={preview ? { backgroundImage: `url(${preview})` } : undefined}
        >
          {preview ? (
            <Image src={preview} alt="preview" width={86} height={86} className="previewAvatar" unoptimized />
          ) : (
            <span className="dropZoneCopy">Arrastra una imagen aqui o toca para seleccionar</span>
          )}
        </div>
        {preview && (
          <button type="button" className="ghostButton" onClick={() => { setAvatarFile(null); setAvatarRemoved(true); setPreview(""); }}>
            Quitar foto
          </button>
        )}
        <input type="file" accept="image/*" ref={fileInput} style={{ display: "none" }} onChange={handleFileChange} />
        <Modal open={cropModal} onClose={() => setCropModal(false)} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto' }}>
          <div className="cropModal">
            <div className="cropperContainer">
              <Cropper
                image={cropImage || undefined}
                crop={crop}
                zoom={zoom}
                aspect={1}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
                cropShape="round"
                showGrid={false}
              />
            </div>
            <div style={{ margin: '16px 0' }}>
              <Slider
                value={zoom}
                min={1}
                max={3}
                step={0.01}
                onChange={(_: Event, v: number | number[]) => setZoom(Number(v))}
              />
            </div>
            <div className="buttonRow">
              <button type="button" onClick={handleCropSave} className="primaryButton">Recortar y usar</button>
              <button type="button" onClick={() => setCropModal(false)} className="ghostButton">Cancelar</button>
            </div>
          </div>
        </Modal>
      </div>

      <button type="submit" className="primaryButton" disabled={loading}>
        {loading ? "Guardando..." : isEdit ? "Guardar Cambios" : "Crear Usuario"}
      </button>

      <style jsx>{`
        .userForm {
          display: grid;
          gap: 14px;
          padding: 2px;
          width: 100%;
        }

        .userFormCompact {
          gap: 12px;
          padding-top: 0;
        }

        .formHeader {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 14px;
          padding: 0 0 12px;
          border-bottom: 1px solid color-mix(in srgb, var(--border) 68%, transparent);
        }

        .formTitle {
          margin: 0 0 6px;
          color: var(--foreground);
          font-weight: 780;
          font-size: clamp(1.5rem, 2.2vw, 1.9rem);
          line-height: 1.08;
          letter-spacing: var(--panel-title-tracking);
        }

        .formSubtitle {
          margin: 0;
          color: var(--text-secondary);
          font-size: 13px;
          line-height: 1.5;
        }

        .formBadge {
          padding: 6px 14px;
          border-radius: 999px;
          font-size: 12px;
          background: linear-gradient(145deg, color-mix(in srgb, var(--primary) 16%, var(--surface)), color-mix(in srgb, var(--surface-2) 86%, transparent));
          border: 1px solid color-mix(in srgb, var(--primary) 34%, var(--border));
          color: var(--foreground);
          font-weight: 750;
        }

        .formGrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .field {
          display: grid;
          gap: 8px;
          padding: 10px;
          border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
          border-radius: 14px;
          background: linear-gradient(162deg, color-mix(in srgb, var(--surface) 99%, transparent), color-mix(in srgb, var(--surface-2) 86%, transparent));
          box-shadow: 0 8px 18px -18px color-mix(in srgb, var(--foreground) 44%, transparent);
        }

        .fieldWide,
        .fieldSection {
          grid-column: 1 / -1;
        }

        .inputRow {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 8px;
          align-items: center;
        }

        .label {
          color: var(--text-secondary);
          font-weight: 700;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.09em;
        }

        .input {
          width: 100%;
          min-height: 44px;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid color-mix(in srgb, var(--border) 74%, transparent);
          background: linear-gradient(180deg, color-mix(in srgb, var(--surface) 99%, transparent), color-mix(in srgb, var(--surface-2) 86%, transparent));
          color: var(--foreground);
          font-size: 14px;
          outline: none;
          box-sizing: border-box;
          transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.18s ease;
          box-shadow: 0 1px 0 color-mix(in srgb, var(--surface) 90%, transparent) inset;
        }

        .input:focus {
          border-color: color-mix(in srgb, var(--primary) 54%, var(--border));
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 16%, transparent), 0 8px 14px -12px color-mix(in srgb, var(--primary) 44%, transparent);
          transform: translateY(-1px);
        }

        .passwordToggleButton {
          min-height: 44px;
          min-width: 76px;
          padding-inline: 12px;
        }

        .checkboxGrid {
          display: grid;
          gap: 8px;
          padding: 10px;
          border-radius: 12px;
          background: linear-gradient(155deg, color-mix(in srgb, var(--surface) 98%, transparent), color-mix(in srgb, var(--surface-2) 82%, transparent));
          border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
          grid-template-columns: repeat(2, minmax(140px, 1fr));
        }

        .checkboxItem {
          display: flex;
          gap: 10px;
          align-items: center;
          font-size: 13px;
          color: var(--text-secondary);
          min-height: 40px;
          padding: 8px 10px;
          border-radius: 9px;
          background: color-mix(in srgb, var(--surface) 92%, transparent);
          border: 1px solid color-mix(in srgb, var(--border) 84%, transparent);
          justify-content: flex-start;
        }

        .checkboxItem span {
          line-height: 1.35;
          color: var(--text-primary);
          font-weight: 560;
        }

        .checkboxItem input[type="checkbox"] {
          width: 16px;
          height: 16px;
          min-width: 16px;
          min-height: 16px;
          margin: 0;
          accent-color: var(--primary);
          transform: none;
        }

        .helperText {
          color: var(--text-secondary);
          font-size: 12px;
        }

        .dropZone {
          border: 2px dashed color-mix(in srgb, var(--border) 66%, transparent);
          border-radius: 14px;
          padding: 16px;
          text-align: center;
          cursor: pointer;
          min-height: 108px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-secondary);
          background: linear-gradient(165deg, color-mix(in srgb, var(--surface-light) 70%, transparent), color-mix(in srgb, var(--surface-2) 82%, transparent));
          background-size: cover;
          background-position: center;
          transition: border-color 0.2s ease, background 0.2s ease;
        }

        .dropZoneActive {
          border-color: var(--primary);
          background: color-mix(in srgb, var(--primary) 14%, var(--surface));
          color: var(--text-primary);
        }

        .dropZoneCopy {
          max-width: 28ch;
          font-size: 13px;
          line-height: 1.45;
          color: var(--text-secondary);
        }

        .previewAvatar {
          border-radius: 50%;
          object-fit: cover;
          border: 3px solid rgba(255, 255, 255, 0.6);
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.25);
        }

        .primaryButton {
          background: linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--secondary) 82%, var(--primary)));
          color: #fff;
          border: none;
          border-radius: 13px;
          min-height: 46px;
          padding: 12px 18px;
          font-weight: 760;
          font-size: 15px;
          cursor: pointer;
          box-shadow: 0 12px 22px -14px color-mix(in srgb, var(--primary) 64%, transparent);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .primaryButton:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .primaryButton:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 16px 26px -14px color-mix(in srgb, var(--primary) 72%, transparent);
        }

        .ghostButton {
          background: color-mix(in srgb, var(--surface) 92%, transparent);
          border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
          color: var(--foreground);
          border-radius: 12px;
          padding: 10px 14px;
          font-weight: 640;
          cursor: pointer;
          transition: border-color 0.2s ease, color 0.2s ease, background-color 0.2s ease;
        }

        .ghostButton:hover {
          border-color: color-mix(in srgb, var(--primary) 44%, var(--border));
          background: color-mix(in srgb, var(--surface-2) 92%, transparent);
          color: var(--foreground);
        }

        .cropModal {
          background: var(--surface);
          padding: clamp(12px, 3vw, 24px);
          border-radius: 16px;
          max-width: 480px;
          width: calc(100vw - 40px);
          max-height: calc(100vh - 80px);
          position: relative;
          box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4);
          display: flex;
          flex-direction: column;
          gap: 0;
          margin: 0;
          outline: none;
        }

        .cropperContainer {
          position: relative;
          width: 100%;
          height: 320px;
          flex-shrink: 0;
          background: #000;
          border-radius: 12px;
          overflow: hidden;
          margin-bottom: 20px;
        }

        .cropModal > div:nth-child(2) {
          flex-shrink: 0;
          padding: 0 4px;
          margin: 0 0 20px 0;
          height: auto;
        }

        .buttonRow {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          flex-shrink: 0;
          margin-top: 0;
          padding-top: 8px;
        }

        .buttonRow button {
          flex: 1;
          min-width: 120px;
          min-height: 48px;
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
          font-size: 14px;
        }

        @media (max-width: 720px) {
          .formGrid {
            grid-template-columns: 1fr;
            gap: 10px;
          }

          .checkboxGrid {
            grid-template-columns: 1fr;
            gap: 7px;
          }

          .field {
            padding: 9px;
            border-radius: 12px;
          }

          .input {
            min-height: 42px;
          }

          .cropModal {
            padding: 20px;
            width: calc(100vw - 32px);
            max-height: calc(100vh - 60px);
            border-radius: 14px;
          }

          .cropperContainer {
            height: 280px;
            margin-bottom: 16px;
            border-radius: 10px;
          }

          .cropModal > div:nth-child(2) {
            margin-bottom: 16px;
          }

          .buttonRow {
            gap: 10px;
            flex-direction: column;
          }

          .buttonRow button {
            width: 100%;
            min-height: 48px;
            font-size: 15px;
            padding: 14px 16px;
          }
        }

        @media (max-width: 720px) {
          .formHeader {
            flex-direction: column;
            align-items: flex-start;
          }

          .formTitle {
            font-size: 1.62rem;
          }
        }
      `}</style>
    </form>
  );
}

