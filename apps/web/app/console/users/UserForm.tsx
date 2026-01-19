"use client";
import React, { useRef, useState } from "react";
import Cropper from "react-easy-crop";
import Slider from "@mui/material/Slider";
import Modal from "@mui/material/Modal";
import getCroppedImg from "./cropImageUtil";
import Image from "next/image";
import { useUser } from "../../../components/UserContext";
import { createUser } from "./api";

const ROLES = [
  { label: "CEO", nivel: 100 },
  { label: "COO", nivel: 50 },
  { label: "Staff", nivel: 10 },
];


export default function UserForm({
  onUserCreated,
  onUserUpdated,
  initialUser,
  isEdit = false,
}: {
  onUserCreated?: () => void;
  onUserUpdated?: (formData: FormData, id: number) => void;
  initialUser?: {
    id?: number;
    nombre?: string;
    email?: string;
    role?: { nivelAutoridad: number };
    department?: { nombre: string };
    avatarUrl?: string;
  };
  isEdit?: boolean;
}) {
  const { user } = useUser();
  const [form, setForm] = useState({
    nombre: initialUser?.nombre || "",
    email: initialUser?.email || "",
    password: "",
    nivelAutoridad: initialUser?.role?.nivelAutoridad || 10,
    department: initialUser?.department?.nombre || "",
    avatarUrl: initialUser?.avatarUrl || "",
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>(initialUser?.avatarUrl || "");
  const [cropModal, setCropModal] = useState(false);
  const [cropImage, setCropImage] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<{ width: number; height: number; x: number; y: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  if (!user || user.nivelAutoridad < 100) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
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
      const data = new FormData();
      data.append("nombre", form.nombre);
      data.append("email", form.email);
      if (form.password) data.append("password", form.password);
      data.append("roleId", String(form.nivelAutoridad));
      data.append("departmentId", form.department);
      if (avatarFile) {
        data.append("avatar", avatarFile);
      }
      if (isEdit && initialUser?.id) {
        if (onUserUpdated) await onUserUpdated(data, initialUser.id);
      } else {
        await createUser(data);
        if (onUserCreated) onUserCreated();
        alert("Usuario creado correctamente");
        setForm({ nombre: "", email: "", password: "", nivelAutoridad: 10, department: "", avatarUrl: "" });
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
    <form onSubmit={handleSubmit} style={{ maxWidth: 400, margin: "0 auto", background: "#fff", padding: 24, borderRadius: 8, boxShadow: "0 2px 8px #0001" }}>
      <h3>{isEdit ? "Editar Usuario" : "Crear Usuario"}</h3>
      <div style={{ marginBottom: 16 }}>
        <label>Nombre</label>
        <input name="nombre" value={form.nombre} onChange={handleChange} required style={{ width: "100%" }} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label>Email</label>
        <input name="email" type="email" value={form.email} onChange={handleChange} required style={{ width: "100%" }} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label>Contraseña</label>
        <input name="password" type="password" value={form.password} onChange={handleChange} required style={{ width: "100%" }} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label>Rol</label>
        <select name="nivelAutoridad" value={form.nivelAutoridad} onChange={handleChange} style={{ width: "100%" }}>
          {ROLES.map((r) => (
            <option key={r.nivel} value={r.nivel}>{r.label}</option>
          ))}
        </select>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label>Departamento</label>
        <input name="department" value={form.department} onChange={handleChange} style={{ width: "100%" }} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label>Foto de usuario</label>
        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          style={{ border: "2px dashed #aaa", borderRadius: 8, padding: 16, textAlign: "center", cursor: "pointer", background: preview ? `url(${preview}) center/cover` : "#f9f9f9", minHeight: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => fileInput.current?.click()}
        >
          {preview ? (
            <Image src={preview} alt="preview" width={80} height={80} style={{ borderRadius: "50%", objectFit: "cover" }} />
          ) : (
            "Arrastra una imagen aquí o haz click"
          )}
        </div>
        {preview && (
          <button type="button" style={{ marginTop: 8 }} onClick={() => { setAvatarFile(null); setPreview(""); }}>Quitar foto</button>
        )}
        <input type="file" accept="image/*" ref={fileInput} style={{ display: "none" }} onChange={handleFileChange} />
        <Modal open={cropModal} onClose={() => setCropModal(false)}>
          <div style={{ background: '#fff', padding: 24, borderRadius: 8, maxWidth: 350, margin: '40px auto', position: 'relative' }}>
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
            <div style={{ margin: '16px 0' }}>
              <Slider
                value={zoom}
                min={1}
                max={3}
                step={0.01}
                onChange={(_: Event, v: number | number[]) => setZoom(Number(v))}
              />
            </div>
            <button type="button" onClick={handleCropSave} style={{ marginRight: 8 }}>Recortar y usar</button>
            <button type="button" onClick={() => setCropModal(false)}>Cancelar</button>
          </div>
        </Modal>
      </div>
      <button type="submit" className="button-primary" disabled={loading} style={{ width: "100%" }}>
        {loading ? "Creando..." : "Crear Usuario"}
      </button>
    </form>
  );
}
