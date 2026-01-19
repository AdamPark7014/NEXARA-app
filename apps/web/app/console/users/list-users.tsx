"use client";
import React, { useEffect, useState } from "react";
import UserForm from "./UserForm";
import Image from "next/image";

export type User = {
  id: number;
  nombre: string;
  email: string;
  avatarUrl?: string;
  role: { nombre: string; nivelAutoridad: number };
  department: { nombre: string };
};

export default function ListUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<User | null>(null);
  const [showModal, setShowModal] = useState(false);

  const fetchUsers = () => {
    setLoading(true);
    fetch("/api/users")
      .then((r) => r.json())
      .then((data) => {
        setUsers(data);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  if (loading) return <div>Cargando usuarios...</div>;

  const handleDelete = async (id: number) => {
    if (!confirm("¿Seguro que deseas eliminar este usuario?")) return;
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    if (res.ok) setUsers(users.filter(u => u.id !== id));
    else alert("Error al eliminar usuario");
  };

  const handleEdit = (user: User) => {
    setEditing(user);
    setShowModal(true);
  };

  const handleUpdate = async (formData: FormData, id: number) => {
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      body: formData,
    });
    if (res.ok) {
      setShowModal(false);
      setEditing(null);
      fetchUsers();
    } else {
      alert("Error al actualizar usuario");
    }
  };

  return (
    <>
      <table style={{ width: "100%", background: "#fff", borderRadius: 8, boxShadow: "0 2px 8px #0001", marginTop: 32 }}>
        <thead>
          <tr>
            <th>Foto</th>
            <th>Nombre</th>
            <th>Email</th>
            <th>Rol</th>
            <th>Nivel</th>
            <th>Departamento</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>
                {u.avatarUrl ? (
                  <Image src={u.avatarUrl} alt={u.nombre} width={40} height={40} style={{ borderRadius: "50%", objectFit: "cover" }} />
                ) : (
                  <span style={{ width: 40, height: 40, display: "inline-block", borderRadius: "50%", background: "#eee", textAlign: "center", lineHeight: "40px" }}>
                    {u.nombre[0]}
                  </span>
                )}
              </td>
              <td>{u.nombre}</td>
              <td>{u.email}</td>
              <td>{u.role?.nombre}</td>
              <td>{u.role?.nivelAutoridad}</td>
              <td>{u.department?.nombre}</td>
              <td>
                <button onClick={() => handleEdit(u)} style={{ marginRight: 8 }}>Editar</button>
                <button onClick={() => handleDelete(u.id)} style={{ color: "red" }}>Eliminar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {showModal && editing && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", background: "#0008", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#fff", padding: 32, borderRadius: 12, minWidth: 350, position: "relative" }}>
            <button onClick={() => setShowModal(false)} style={{ position: "absolute", top: 8, right: 8 }}>✕</button>
            <UserForm
              initialUser={editing}
              onUserCreated={() => {
                setShowModal(false);
                setEditing(null);
                fetchUsers();
              }}
              onUserUpdated={handleUpdate}
              isEdit
            />
          </div>
        </div>
      )}
    </>
  );
}
