"use client";
import { buildApiUrl } from "@/lib/api-base";
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


// Extiende el tipo de initialUser para que su role incluya los campos de acceso
export type UserRole = {
  id: number;
  nombre: string;
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

export default function UserForm({
  onUserCreated,
  onUserUpdated,
  initialUser,
  isEdit = false,
}: {
  onUserCreated?: () => void;
  onUserUpdated?: (formData: FormData, id: number) => void;
  initialUser?: UserFormInitialUser;
  isEdit?: boolean;
}) {
  const { user } = useUser();
  const searchParams = useSearchParams();
  
  const getFullImageUrl = (url: string | undefined) => resolveUserAvatarUrl(url);

  const prefillName = searchParams.get('prefillName') || '';
  const prefillEmail = searchParams.get('prefillEmail') || '';
  const prefillRole = searchParams.get('prefillRoleName') || '';
  const initialRoleName = String(initialUser?.role?.nombre || (!isEdit ? prefillRole : "")).trim() || "Vendedor";
  const initialRoleLower = initialRoleName.toLowerCase();
  const initialRoleTipo: "vendedor" | "ingeniero" | "administrador" = initialRoleLower.includes("admin")
    ? "administrador"
    : initialRoleLower.includes("ingenier")
      ? "ingeniero"
      : "vendedor";
  const initialCargo = initialRoleTipo === "vendedor" || initialRoleName.toLowerCase() === initialRoleTipo
    ? ""
    : initialRoleName;

  const [form, setForm] = useState({
    nombre: initialUser?.nombre || (!isEdit ? prefillName : ""),
    email: initialUser?.email || (!isEdit ? prefillEmail : ""),
    employeeNumber: initialUser?.employeeNumber || "",
    password: "",
    departmentId: initialUser?.department?.id ? String(initialUser.department.id) : "",
    department: initialUser?.department?.nombre || "",
    avatarUrl: initialUser?.avatarUrl || "",
    roleTipo: initialRoleTipo,
    cargo: initialCargo,
    // Rol personalizado
    roleNombre: initialRoleName,
    accesoConsole: initialUser?.role?.accesoConsole || false,
    accesoConsoleAdmin: initialUser?.role?.accesoConsoleAdmin || false,
    accesoGestionWeb: initialUser?.role?.accesoGestionWeb || false,
    accesoGestionCvs: initialUser?.role?.accesoGestionCvs || false,
    accesoPanelVentas: initialUser?.role?.accesoPanelVentas || false,
    accesoContabilidad: initialUser?.role?.accesoContabilidad || false,
    accesoCotizaciones: initialUser?.role?.accesoCotizaciones || false,
  });
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
      const nextForm = { ...prev, [name]: nextValue };
      if (name === "nombre" && !isEdit && !emailManuallyEdited) {
        nextForm.email = suggestConsoleEmail(String(nextValue || ""));
      }
      if (!isEdit && !passwordManuallyEdited && (name === "nombre" || name === "employeeNumber")) {
        const suggestedEmployeeNumber = name === "employeeNumber"
          ? String(nextValue || "")
          : String(nextForm.employeeNumber || employeeNumberPreview || "");
        const suggestedName = name === "nombre" ? String(nextValue || "") : String(nextForm.nombre || "");
        nextForm.password = buildSuggestedPassword(suggestedName, suggestedEmployeeNumber, passwordSeed);
      }
      if (name === "department") {
        nextForm.departmentId = "";
      }
      if (name === "roleTipo") {
        if (value === "vendedor") {
          nextForm.cargo = "";
          nextForm.roleNombre = "Vendedor";
        } else if (nextForm.cargo.trim()) {
          nextForm.roleNombre = nextForm.cargo.trim();
        } else {
          nextForm.roleNombre = value === "administrador" ? "Administrador" : "Ingeniero";
        }
      }
      if (name === "cargo") {
        const trimmedCargo = String(value || "").trim();
        if (nextForm.roleTipo !== "vendedor") {
          nextForm.roleNombre = trimmedCargo || (nextForm.roleTipo === "administrador" ? "Administrador" : "Ingeniero");
        }
      }
      if (name === "accesoConsoleAdmin" && target.checked) {
        nextForm.accesoConsole = true;
        nextForm.accesoGestionCvs = false;
      }
      if (name === 'accesoGestionCvs' && target.checked) {
        nextForm.accesoConsole = true;
        nextForm.accesoConsoleAdmin = false;
      }
      return nextForm;
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
      const effectiveRoleName = form.roleTipo === "vendedor"
        ? "Vendedor"
        : (form.cargo || "").trim() || (form.roleTipo === "administrador" ? "Administrador" : "Ingeniero");

      if (form.roleTipo !== "vendedor" && !(form.cargo || "").trim()) {
        alert("Por favor especifique su cargo para el rol seleccionado");
        setLoading(false);
        return;
      }

      const isConsoleUser = form.accesoConsole || form.accesoConsoleAdmin || form.accesoGestionCvs;
      const isConsoleAdmin = form.accesoConsoleAdmin;
      const enableConsoleModules = isConsoleUser || isConsoleAdmin;
      const isAdminRole = form.roleTipo === "administrador";
      const rolePayload = {
        nombre: effectiveRoleName,
        accesoConsole: isConsoleUser || isAdminRole,
        accesoConsoleAdmin: isConsoleAdmin || isAdminRole,
        accesoActividades: enableConsoleModules,
        accesoEvidencias: enableConsoleModules,
        accesoViaticos: enableConsoleModules,
        accesoVehiculos: enableConsoleModules,
        accesoAsistencia: enableConsoleModules,
        accesoGps: enableConsoleModules,
        accesoGestionUsuarios: isConsoleAdmin || isAdminRole,
        accesoGestionWeb: form.accesoGestionWeb || isAdminRole,
        accesoGestionCvs: form.accesoGestionCvs,
        accesoPanelVentas: form.accesoPanelVentas,
        accesoContabilidad: form.accesoContabilidad || isAdminRole,
        accesoCotizaciones: form.accesoCotizaciones,
        accesoInventario: isAdminRole,
        accesoCompras: isAdminRole,
        accesoSeguridad: isAdminRole,
        accesoDocumentos: isAdminRole,
        accesoWorkflow: isAdminRole,
        accesoAuditoria: isAdminRole,
        accesoBI: isAdminRole,
        accesoBanca: isAdminRole,
      };

      const getErrorMessage = async (res: Response, fallback: string) => {
        try {
          const data = await res.json();
          return data?.message || fallback;
        } catch {
          return fallback;
        }
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
        return Array.isArray(roles)
          ? roles.find((r) => r?.nombre === effectiveRoleName)
          : null;
      };

      const roleMatchesPayload = (role: Record<string, unknown> | null | undefined) => {
        if (!role) return false;
        const keys = Object.keys(rolePayload) as Array<keyof typeof rolePayload>;
        return keys.every((key) => Boolean(role[key]) === Boolean(rolePayload[key]));
      };

      const createPersonalizedRole = async () => {
        const safeEmailPrefix = String(form.email || 'usuario')
          .split('@')[0]
          .replace(/[^a-zA-Z0-9_-]/g, '')
          .slice(0, 24) || 'usuario';

        const baseName = `${effectiveRoleName} · ${safeEmailPrefix}`;
        let attempt = 0;
        let lastError = 'Error al crear rol personalizado';

        while (attempt < 5) {
          const candidateName = attempt === 0 ? baseName : `${baseName}-${attempt + 1}`;
          const roleRes = await fetch(buildApiUrl('roles'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
            },
            body: JSON.stringify({ ...rolePayload, nombre: candidateName }),
          });

          if (roleRes.ok) {
            const roleData = await roleRes.json();
            return roleData?.id as number;
          }

          lastError = await getErrorMessage(roleRes, lastError);
          attempt += 1;
        }

        throw new Error(lastError);
      };

      // 1. Resolver rol para asignar al usuario en edición/creación.
      // Nunca mutar el rol compartido desde este formulario: evita propagar cambios a otros usuarios.
      let roleId: number | null = null;
      if (effectiveRoleName) {
        const existing = await fetchRoleByName();
        if (existing?.id && roleMatchesPayload(existing)) {
          roleId = Number(existing.id);
        } else if (existing?.id) {
          roleId = await createPersonalizedRole();
        } else {
          const roleRes = await fetch(buildApiUrl('roles'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
            },
            body: JSON.stringify(rolePayload),
          });
          if (!roleRes.ok) throw new Error(await getErrorMessage(roleRes, 'Error al crear el rol'));
          const roleData = await roleRes.json();
          roleId = roleData.id;
        }
      }
      // 2. Crear el usuario con el roleId
      const data = new FormData();
      data.append("nombre", form.nombre);
      data.append("email", form.email);
      data.append("employeeNumber", form.employeeNumber.trim() || employeeNumberPreview);
      if (form.password) data.append("password", form.password);
      data.append("roleId", String(roleId));
      const resolvedDepartment = (form.departmentId || "").trim() || (form.department || "").trim();
      data.append("departmentId", resolvedDepartment);
      appendAvatarToFormData(data, avatarFile, avatarRemoved);
      if (isEdit && initialUser?.id) {
        if (onUserUpdated) await onUserUpdated(data, initialUser.id);
      } else {
        await createUser(data, user?.token);
        if (onUserCreated) onUserCreated();
        alert("Usuario creado correctamente");
        setForm({
          nombre: "",
          email: "",
          employeeNumber: "",
          password: "",
          departmentId: "",
          department: "",
          avatarUrl: "",
          roleTipo: "vendedor",
          cargo: "",
          roleNombre: "Vendedor",
          accesoConsole: false,
          accesoConsoleAdmin: false,
          accesoGestionWeb: false,
          accesoGestionCvs: false,
          accesoPanelVentas: false,
          accesoContabilidad: false,
          accesoCotizaciones: false,
        });
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
    <form onSubmit={handleSubmit} className="userForm">
      <div className="formHeader">
        <div>
          <h3 className="formTitle">{isEdit ? "Editar Usuario" : "Crear Usuario"}</h3>
          <p className="formSubtitle">Gestiona datos, permisos y fotografía del perfil.</p>
        </div>
        {user?.isSuperAdmin && <span className="formBadge">Superadmin</span>}
      </div>

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
        <div className="field">
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
              className="ghostButton"
              onClick={() => setShowPassword((prev) => !prev)}
              style={{ height: 42 }}
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
            <option value="ingeniero">Ingeniero</option>
            <option value="administrador">Administrador</option>
          </select>
        </div>
        {form.roleTipo !== "vendedor" && (
          <div className="field">
            <label className="label">Por favor especifique su cargo</label>
            <input
              name="cargo"
              value={form.cargo}
              onChange={handleChange}
              required
              className="input"
              placeholder="Ej: Jefe de Ingeniería, Coordinador de Operaciones"
            />
          </div>
        )}
        <div className="field">
          <label className="label">Nombre visible del rol</label>
          <input name="roleNombre" value={form.roleNombre} readOnly className="input" />
        </div>
        <div className="field">
          <label className="label">Departamento</label>
          <input name="department" value={form.department} onChange={handleChange} className="input" />
        </div>
      </div>

      <div className="field">
        <label className="label">Accesos permitidos</label>
        <div className="checkboxGrid">
          <label className="checkboxItem"><input type="checkbox" name="accesoConsole" checked={form.accesoConsole} onChange={handleChange} /> Consola usuario</label>
          {user?.isSuperAdmin && <label className="checkboxItem"><input type="checkbox" name="accesoConsoleAdmin" checked={form.accesoConsoleAdmin} onChange={handleChange} /> Consola admin</label>}
          <label className="checkboxItem"><input type="checkbox" name="accesoGestionWeb" checked={form.accesoGestionWeb} onChange={handleChange} /> Panel Web</label>
          <label className="checkboxItem"><input type="checkbox" name="accesoGestionCvs" checked={form.accesoGestionCvs} onChange={handleChange} /> Gestión de CVs</label>
          <label className="checkboxItem"><input type="checkbox" name="accesoPanelVentas" checked={form.accesoPanelVentas} onChange={handleChange} /> Panel Ventas</label>
          {user?.isSuperAdmin && <label className="checkboxItem"><input type="checkbox" name="accesoContabilidad" checked={form.accesoContabilidad} onChange={handleChange} /> Panel Contabilidad</label>}
          <label className="checkboxItem"><input type="checkbox" name="accesoCotizaciones" checked={form.accesoCotizaciones} onChange={handleChange} /> Pestaña de cotizaciones</label>
        </div>
      </div>

      <div className="field">
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
            <span>Arrastra una imagen aquí o haz click</span>
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
          gap: 18px;
          padding: 8px 4px 4px;
          width: 100%;
        }

        .formHeader {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }

        .formTitle {
          margin: 0 0 6px;
          color: var(--primary);
          font-weight: 700;
          font-size: 22px;
        }

        .formSubtitle {
          margin: 0;
          color: var(--text-secondary);
          font-size: 13px;
        }

        .formBadge {
          padding: 6px 12px;
          border-radius: 999px;
          font-size: 12px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: var(--text-secondary);
        }

        .formGrid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 14px;
        }

        .field {
          display: grid;
          gap: 8px;
        }

        .inputRow {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 10px;
          align-items: center;
        }

        .label {
          color: var(--primary);
          font-weight: 600;
          font-size: 14px;
        }

        .input {
          width: 100%;
          padding: 10px 14px;
          border-radius: 10px;
          border: 1px solid var(--muted);
          background: var(--background);
          color: var(--foreground);
          font-size: 15px;
          outline: none;
          box-sizing: border-box;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }

        .input:focus {
          border-color: rgba(15, 106, 214, 0.6);
          box-shadow: 0 0 0 2px rgba(15, 106, 214, 0.15);
        }

        .checkboxGrid {
          display: grid;
          gap: 8px;
          padding: 12px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        }

        .checkboxItem {
          display: flex;
          gap: 8px;
          align-items: center;
          font-size: 13px;
          color: var(--text-secondary);
        }

        .helperText {
          color: var(--text-secondary);
          font-size: 12px;
        }

        .dropZone {
          border: 2px dashed var(--muted);
          border-radius: 12px;
          padding: 20px;
          text-align: center;
          cursor: pointer;
          min-height: 110px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-secondary);
          background: var(--surface-light);
          background-size: cover;
          background-position: center;
          transition: border-color 0.2s ease, background 0.2s ease;
        }

        .dropZoneActive {
          border-color: var(--primary);
          background: rgba(15, 106, 214, 0.12);
          color: var(--text-primary);
        }

        .previewAvatar {
          border-radius: 50%;
          object-fit: cover;
          border: 3px solid rgba(255, 255, 255, 0.6);
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.25);
        }

        .primaryButton {
          background: var(--primary);
          color: #fff;
          border: none;
          border-radius: 10px;
          padding: 12px 18px;
          font-weight: 700;
          font-size: 15px;
          cursor: pointer;
          box-shadow: 0 10px 18px rgba(15, 106, 214, 0.2);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .primaryButton:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .primaryButton:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 14px 26px rgba(15, 106, 214, 0.25);
        }

        .ghostButton {
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: var(--text-secondary);
          border-radius: 10px;
          padding: 10px 14px;
          font-weight: 600;
          cursor: pointer;
          transition: border-color 0.2s ease, color 0.2s ease;
        }

        .ghostButton:hover {
          border-color: rgba(15, 106, 214, 0.5);
          color: var(--text-primary);
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

        @media (max-width: 600px) {
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
        }
      `}</style>
    </form>
  );
}

