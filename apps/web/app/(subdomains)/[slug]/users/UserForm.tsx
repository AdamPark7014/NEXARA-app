"use client";
import React, { useRef, useState } from "react";
import Cropper from "react-easy-crop";
import Slider from "@mui/material/Slider";
import Modal from "@mui/material/Modal";
import { useSearchParams } from "next/navigation";
import getCroppedImg from "./cropImageUtil";
import Image from "next/image";
import { useUser } from '@/components/UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';
import { createUser } from "./api";


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
  role?: UserRole;
  department?: { id?: number; nombre: string };
  avatarUrl?: string;
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
  let API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
  API_URL = API_URL.replace(/[\/.]+$/, '');
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;
  
  // Helper para obtener la ruta del avatar
  const getFullImageUrl = (url: string | undefined) => {
    if (!url) return '';
    // Retornar la ruta relativa, el servidor la servirá correctamente
    return url.startsWith('/') ? url : `/${url}`;
  };

  const prefillName = searchParams.get('prefillName') || '';
  const prefillEmail = searchParams.get('prefillEmail') || '';
  const prefillRole = searchParams.get('prefillRoleName') || '';

  const [form, setForm] = useState({
    nombre: initialUser?.nombre || (!isEdit ? prefillName : ""),
    email: initialUser?.email || (!isEdit ? prefillEmail : ""),
    password: "",
    departmentId: initialUser?.department?.id ? String(initialUser.department.id) : "",
    department: initialUser?.department?.nombre || "",
    avatarUrl: initialUser?.avatarUrl || "",
    // Rol personalizado
    roleNombre: initialUser?.role?.nombre || (!isEdit ? prefillRole : ""),
    accesoConsole: initialUser?.role?.accesoConsole || false,
    accesoConsoleAdmin: initialUser?.role?.accesoConsoleAdmin || false,
    accesoGestionWeb: initialUser?.role?.accesoGestionWeb || false,
    accesoGestionCvs: initialUser?.role?.accesoGestionCvs || false,
    accesoPanelVentas: initialUser?.role?.accesoPanelVentas || false,
    accesoContabilidad: initialUser?.role?.accesoContabilidad || false,
    accesoCotizaciones: initialUser?.role?.accesoCotizaciones || false,
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  // ...existing code...

  const [preview, setPreview] = useState<string>(getFullImageUrl(initialUser?.avatarUrl));
  const [cropModal, setCropModal] = useState(false);
  const [cropImage, setCropImage] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<{ width: number; height: number; x: number; y: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  if (!user || !hasPermission(user, PERMISSIONS.USERS_MANAGE)) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const target = e.target as HTMLInputElement;
    const { name, value, type } = target;
    const nextValue = type === "checkbox" ? target.checked : value;
    setForm((prev) => {
      const nextForm = { ...prev, [name]: nextValue };
      if (name === "department") {
        nextForm.departmentId = "";
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
    setPreview(cropped.url);
    setCropModal(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const isConsoleUser = form.accesoConsole || form.accesoConsoleAdmin || form.accesoGestionCvs;
      const isConsoleAdmin = form.accesoConsoleAdmin;
      const enableConsoleModules = isConsoleUser || isConsoleAdmin;
      const rolePayload = {
        nombre: form.roleNombre,
        accesoConsole: isConsoleUser,
        accesoConsoleAdmin: isConsoleAdmin,
        accesoActividades: enableConsoleModules,
        accesoEvidencias: enableConsoleModules,
        accesoViaticos: enableConsoleModules,
        accesoVehiculos: enableConsoleModules,
        accesoAsistencia: enableConsoleModules,
        accesoGps: enableConsoleModules,
        accesoGestionUsuarios: isConsoleAdmin,
        accesoGestionWeb: form.accesoGestionWeb,
        accesoGestionCvs: form.accesoGestionCvs,
        accesoPanelVentas: form.accesoPanelVentas,
        accesoContabilidad: form.accesoContabilidad,
        accesoCotizaciones: form.accesoCotizaciones,
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
          ? roles.find((r) => r?.nombre === form.roleNombre)
          : null;
      };

      // 1. Crear/actualizar rol
      let roleId: number | null = null;
      if (form.roleNombre) {
        if (isEdit && initialUser?.role?.id) {
          const existing = await fetchRoleByName();
          if (existing && existing.id !== initialUser.role.id) {
            const patchRes = await fetch(buildApiUrl(`roles/${existing.id}`), {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
              },
              body: JSON.stringify(rolePayload),
            });
            if (!patchRes.ok) throw new Error(await getErrorMessage(patchRes, 'Error al actualizar el rol'));
            roleId = existing.id;
          } else {
            const patchRes = await fetch(buildApiUrl(`roles/${initialUser.role.id}`), {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
              },
              body: JSON.stringify(rolePayload),
            });
            if (!patchRes.ok) throw new Error(await getErrorMessage(patchRes, 'Error al actualizar el rol'));
            roleId = initialUser.role.id;
          }
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
          } else {
            const match = await fetchRoleByName();
            if (!match?.id) throw new Error('Error al crear el rol');
            const patchRes = await fetch(buildApiUrl(`roles/${match.id}`), {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
              },
              body: JSON.stringify(rolePayload),
            });
            if (!patchRes.ok) throw new Error(await getErrorMessage(patchRes, 'Error al actualizar el rol'));
            roleId = match.id;
          }
        }
      }
      // 2. Crear el usuario con el roleId
      const data = new FormData();
      data.append("nombre", form.nombre);
      data.append("email", form.email);
      if (form.password) data.append("password", form.password);
      data.append("roleId", String(roleId));
      const resolvedDepartment = (form.departmentId || "").trim() || (form.department || "").trim();
      data.append("departmentId", resolvedDepartment);
      if (avatarFile) {
        data.append("avatar", avatarFile);
      }
      if (isEdit && initialUser?.id) {
        if (onUserUpdated) await onUserUpdated(data, initialUser.id);
      } else {
        await createUser(data, user?.token);
        if (onUserCreated) onUserCreated();
        alert("Usuario creado correctamente");
        setForm({
          nombre: "",
          email: "",
          password: "",
          departmentId: "",
          department: "",
          avatarUrl: "",
          roleNombre: "",
          accesoConsole: false,
          accesoConsoleAdmin: false,
          accesoGestionWeb: false,
          accesoGestionCvs: false,
          accesoPanelVentas: false,
          accesoContabilidad: false,
          accesoCotizaciones: false,
        });
        setAvatarFile(null);
        setPreview("");
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
          <p className="formSubtitle">Gestiona datos, permisos y fotografia del perfil.</p>
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
              Por seguridad no se puede ver la contraseña actual. Ingresa una nueva si deseas cambiarla.
            </span>
          )}
        </div>
        <div className="field">
          <label className="label">Nombre del Rol</label>
          <input name="roleNombre" value={form.roleNombre} onChange={handleChange} required className="input" placeholder="Ej: Supervisor, PanelWeb, etc." />
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
          <label className="checkboxItem"><input type="checkbox" name="accesoCotizaciones" checked={form.accesoCotizaciones} onChange={handleChange} /> Panel Cotizaciones</label>
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
            <span>Arrastra una imagen aqui o haz click</span>
          )}
        </div>
        {preview && (
          <button type="button" className="ghostButton" onClick={() => { setAvatarFile(null); setPreview(""); }}>
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
