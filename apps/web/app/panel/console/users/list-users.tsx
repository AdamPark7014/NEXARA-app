"use client";
import React, { useEffect, useState } from "react";
import UserForm from "./UserForm";
import Image from "next/image";
import { useUser } from '@/components/UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';

let API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
// Normaliza la URL base para evitar dobles / o .
API_URL = API_URL.replace(/[\/.]+$/, '');

function buildApiUrl(path: string) {
  // Quita cualquier slash inicial del path
  path = path.replace(/^\/+/, '');
  // Asegura que la URL final sea correcta
  return `${API_URL}/${path}`;
}

export type User = {
  id: number;
  nombre: string;
  email: string;
  avatarUrl?: string;
  role: {
    id: number;
    nombre: string;
    accesoActividades?: boolean;
    accesoGestionUsuarios?: boolean;
    accesoGestionTienda?: boolean;
    accesoGestionWeb?: boolean;
    accesoContabilidad?: boolean;
  };
  department: { id?: number; nombre: string };
};

const requiredDocuments = [
  {
    key: 'INE',
    label: 'INE vigente (frontal y reverso en un solo PDF)',
    description: 'Documento oficial de identidad con fotografia.'
  },
  {
    key: 'CURP',
    label: 'CURP en PDF',
    description: 'Formato oficial emitido por gobierno.'
  },
  {
    key: 'RFC',
    label: 'RFC en PDF',
    description: 'Constancia de RFC o formato oficial.'
  },
  {
    key: 'Constancia de situacion fiscal',
    label: 'Constancia de situacion fiscal (PDF)',
    description: 'Emitida por el SAT.'
  },
  {
    key: 'Comprobante de domicilio',
    label: 'Comprobante de domicilio (PDF)',
    description: 'No mayor a 3 meses.'
  },
  {
    key: 'NSS',
    label: 'NSS (PDF)',
    description: 'Documento del IMSS o constancia equivalente.'
  },
  {
    key: 'Acta de nacimiento',
    label: 'Acta de nacimiento (PDF)',
    description: 'Documento oficial completo.'
  },
  {
    key: 'Comprobante de estudios',
    label: 'Comprobante de estudios (PDF)',
    description: 'Ultimo grado academico.'
  },
  {
    key: 'Licencia de conducir',
    label: 'Licencia de conducir (PDF)',
    description: 'Solo si aplica al puesto.'
  },
  {
    key: 'Contrato o alta',
    label: 'Contrato o alta interna (PDF)',
    description: 'Documento emitido por la empresa.'
  },
  {
    key: 'Carta de antecedentes no penales',
    label: 'Carta de antecedentes no penales (PDF)',
    description: 'Vigente y legible.'
  },
];

type UserProfile = {
  perfil?: {
    estatus?: string | null;
    observaciones?: string | null;
    telefono?: string | null;
    fechaNacimiento?: string | null;
    direccion?: string | null;
    colonia?: string | null;
    ciudad?: string | null;
    estado?: string | null;
    codigoPostal?: string | null;
    pais?: string | null;
    curp?: string | null;
    rfc?: string | null;
    ineNumero?: string | null;
    nss?: string | null;
    contactoEmergenciaNombre?: string | null;
    contactoEmergenciaTelefono?: string | null;
  };
  documentos?: { id: number; tipo: string; archivoUrl: string; estatus?: string; observaciones?: string | null }[];
};

export default function ListUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<User | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [profileData, setProfileData] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileReviewNote, setProfileReviewNote] = useState('');
  const [docReviewNotes, setDocReviewNotes] = useState<Record<number, string>>({});
  const { user } = useUser();

  const normalizeDocumentKey = (raw: string) => {
    const baseKey = raw.toLowerCase().trim();
    if (baseKey === 'constancia situacion fiscal') return 'constancia de situacion fiscal';
    if (baseKey === 'comprobante domicilio') return 'comprobante de domicilio';
    if (baseKey === 'licencia') return 'licencia de conducir';
    if (baseKey === 'contrato') return 'contrato o alta';
    return baseKey;
  };

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\/.]+$/, '');
  const getAssetUrl = (url?: string | null) => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    const base = API_URL.replace(/\/+api\/?$/, '');
    return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  const getDocExtension = (url: string) => {
    const clean = url.split('?')[0].split('#')[0];
    const parts = clean.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
  };

  const isPdf = (url: string) => getDocExtension(url) === 'pdf';
  const isImage = (url: string) => ['png', 'jpg', 'jpeg', 'webp'].includes(getDocExtension(url));

  const fetchUsers = () => {
    setLoading(true);
    fetch(buildApiUrl('users'), {
      headers: user?.token ? { Authorization: `Bearer ${user.token}` } : {},
    })
      .then((r) => {
        if (!r.ok) throw new Error('No autorizado');
        return r.json();
      })
      .then((data) => {
        const filtered = Array.isArray(data)
          ? data.filter((item) => {
              const email = String(item?.email || '').toLowerCase();
              return email !== 'gerencia@nexara.com.mx' && email !== 'developer@nexara.com.mx';
            })
          : [];
        setUsers(filtered);
        setLoading(false);
      })
      .catch(() => {
        setUsers([]);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.token]);

  if (loading) return <div>Cargando usuarios...</div>;

  const handleDelete = async (id: number) => {
    if (!confirm("¿Seguro que deseas eliminar este usuario?")) return;
    const res = await fetch(buildApiUrl(`users/${id}`), {
      method: "DELETE",
      headers: user?.token ? { Authorization: `Bearer ${user.token}` } : {},
    });
    if (res.ok) setUsers(users.filter(u => u.id !== id));
    else alert("Error al eliminar usuario");
  };

  const handleEdit = (user: User) => {
    setEditing(user);
    setShowModal(true);
  };

  const handleViewProfile = async (u: User) => {
    if (!user?.token) return;
    if (!hasPermission(user, PERMISSIONS.USERS_REVIEW)) {
      alert('No tienes permisos para ver la informacion de este usuario.');
      return;
    }
    if (!user.isSuperAdmin && user.departmentId && u.department?.id && user.departmentId !== u.department.id) {
      alert('No tienes permisos para ver usuarios de otro departamento.');
      return;
    }
    setProfileUser(u);
    setProfileLoading(true);
    setProfileModalOpen(true);
    try {
      const res = await fetch(buildApiUrl(`users/${u.id}/profile`), {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (!res.ok) throw new Error('No autorizado');
      const data = await res.json();
      setProfileData(data || null);
      setProfileReviewNote(data?.perfil?.observaciones || '');
    } catch {
      setProfileData(null);
    } finally {
      setProfileLoading(false);
    }
  };

  const handleProfileReview = async (estatus: 'Aprobado' | 'Rechazado') => {
    if (!user?.token || !profileUser) return;
    const res = await fetch(buildApiUrl(`users/${profileUser.id}/profile/review`), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.token}`,
      },
      body: JSON.stringify({
        estatus,
        observaciones: profileReviewNote,
      }),
    });
    if (res.ok) {
      handleViewProfile(profileUser);
    }
  };

  const handleDocumentReview = async (docId: number, estatus: 'Aprobado' | 'Rechazado') => {
    if (!user?.token) return;
    const res = await fetch(buildApiUrl(`users/documents/${docId}/review`), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.token}`,
      },
      body: JSON.stringify({
        estatus,
        observaciones: docReviewNotes[docId] || '',
      }),
    });
    if (res.ok && profileUser) {
      handleViewProfile(profileUser);
    }
  };

  const handleUpdate = async (formData: FormData, id: number) => {
    const res = await fetch(buildApiUrl(`users/${id}`), {
      method: "PATCH",
      headers: user?.token ? { Authorization: `Bearer ${user.token}` } : {},
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

  const tableWrapStyle: React.CSSProperties = {
    width: "100%",
    overflowX: "auto",
    marginTop: 32,
    borderRadius: 16,
    border: "1px solid var(--muted)",
    background: "var(--surface)",
    boxShadow: "0 12px 26px var(--shadow)",
  };

  return (
    <>
      <div style={tableWrapStyle}>
        <table className="table" style={{ minWidth: 760 }}>
          <thead>
            <tr>
              <th>Foto</th>
              <th>Nombre</th>
              <th>Email</th>
              <th>Rol</th>
              <th>Departamento</th>
              <th>Perfil</th>
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
                    <span style={{ width: 40, height: 40, display: "inline-block", borderRadius: "50%", background: "var(--muted)", textAlign: "center", lineHeight: "40px", color: "var(--primary)", fontWeight: 700 }}>
                      {u.nombre[0]}
                    </span>
                  )}
                </td>
                <td>{u.nombre}</td>
                <td>{u.email}</td>
                <td>{u.role?.nombre}</td>
                <td>{u.department?.nombre}</td>
                <td>
                  {hasPermission(user, PERMISSIONS.USERS_REVIEW) ? (
                    <button
                      onClick={() => handleViewProfile(u)}
                      style={{
                        background: "var(--info)",
                        color: "#fff",
                        border: "none",
                        borderRadius: 6,
                        padding: "6px 14px",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Ver informacion
                    </button>
                  ) : (
                    <span style={{ color: 'var(--muted)', fontSize: 12 }}>Sin permisos</span>
                  )}
                </td>
                <td>
                  {user && hasPermission(user, PERMISSIONS.USERS_MANAGE) && (!user.isSuperAdmin && u.department?.id ? user.departmentId === u.department.id : true) && (
                    <>
                      <button
                        onClick={() => handleEdit(u)}
                        style={{
                          marginRight: 8,
                          background: "var(--primary)",
                          color: "#fff",
                          border: "none",
                          borderRadius: 6,
                          padding: "6px 14px",
                          fontWeight: 500,
                          cursor: "pointer",
                        }}
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(u.id)}
                        style={{
                          background: "var(--danger)",
                          color: "#fff",
                          border: "none",
                          borderRadius: 6,
                          padding: "6px 14px",
                          fontWeight: 500,
                          cursor: "pointer",
                        }}
                      >
                        Eliminar
                      </button>
                    </>
                  )}
                  {!hasPermission(user, PERMISSIONS.USERS_MANAGE) && (
                    <span style={{ color: 'var(--muted)', fontSize: 12 }}>Sin permisos</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showModal && editing && (
        <div className="editModalOverlay" role="dialog" aria-modal="true">
          <div className="editModal">
            <button onClick={() => setShowModal(false)} className="editModalClose" aria-label="Cerrar">✕</button>
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
      {profileModalOpen && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", background: "#0008", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "var(--surface)", padding: 24, borderRadius: 16, width: "min(980px, 94vw)", position: "relative", maxHeight: "90vh", overflowY: "auto" }}>
            <button onClick={() => setProfileModalOpen(false)} style={{ position: "absolute", top: 8, right: 8 }}>✕</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
              {profileUser?.avatarUrl ? (
                <Image src={profileUser.avatarUrl} alt={profileUser.nombre} width={56} height={56} style={{ borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--muted)', display: 'grid', placeItems: 'center', fontWeight: 700, color: 'var(--primary)' }}>
                  {profileUser?.nombre?.[0] || 'U'}
                </div>
              )}
              <div>
                <h3 style={{ marginBottom: 4 }}>{profileUser?.nombre}</h3>
                <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{profileUser?.email}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                  {profileUser?.role?.nombre}
                </div>
              </div>
            </div>
            {profileLoading && <div>Cargando perfil...</div>}
            {!profileLoading && (
              <div style={{ display: 'grid', gap: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
                  <div className="card" style={{ padding: 12, background: 'var(--surface-light)' }}>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>Estado de perfil</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span className={`badge ${profileData?.perfil?.estatus === 'Aprobado' ? 'approved' : profileData?.perfil?.estatus === 'Rechazado' ? 'rejected' : 'pending'}`}>
                        {profileData?.perfil?.estatus || 'Pendiente'}
                      </span>
                      {profileData?.perfil?.observaciones && (
                        <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{profileData.perfil.observaciones}</span>
                      )}
                    </div>
                    <textarea
                      className="input"
                      rows={2}
                      placeholder="Observaciones"
                      value={profileReviewNote}
                      onChange={(event) => setProfileReviewNote(event.target.value)}
                      style={{ marginTop: 8 }}
                    />
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button className="button-primary" onClick={() => handleProfileReview('Aprobado')}>Aprobar informacion</button>
                      <button className="button-secondary" onClick={() => handleProfileReview('Rechazado')}>Rechazar</button>
                    </div>
                  </div>
                  <div className="card" style={{ padding: 12, background: 'var(--surface-light)' }}>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>Datos personales</div>
                    <div>Telefono: {profileData?.perfil?.telefono || '-'}</div>
                    <div>Fecha nacimiento: {profileData?.perfil?.fechaNacimiento || '-'}</div>
                    <div>CURP: {profileData?.perfil?.curp || '-'}</div>
                    <div>RFC: {profileData?.perfil?.rfc || '-'}</div>
                    <div>INE: {profileData?.perfil?.ineNumero || '-'}</div>
                    <div>NSS: {profileData?.perfil?.nss || '-'}</div>
                  </div>
                  <div className="card" style={{ padding: 12, background: 'var(--surface-light)' }}>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>Direccion</div>
                    <div>{profileData?.perfil?.direccion || '-'}</div>
                    <div>{profileData?.perfil?.colonia || '-'} | {profileData?.perfil?.codigoPostal || '-'}</div>
                    <div>{profileData?.perfil?.ciudad || '-'}, {profileData?.perfil?.estado || '-'}</div>
                    <div>{profileData?.perfil?.pais || '-'}</div>
                  </div>
                  <div className="card" style={{ padding: 12, background: 'var(--surface-light)' }}>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>Contacto de emergencia</div>
                    <div>{profileData?.perfil?.contactoEmergenciaNombre || '-'}</div>
                    <div>{profileData?.perfil?.contactoEmergenciaTelefono || '-'}</div>
                  </div>
                </div>

                <div className="card" style={{ padding: 12, background: 'var(--surface-light)' }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>Documentos (PDF)</div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    {requiredDocuments.map((doc) => {
                      const match = profileData?.documentos?.find((item) => normalizeDocumentKey(item.tipo) === doc.key.toLowerCase().trim());
                      const status = match?.estatus || 'Pendiente';
                      return (
                        <div key={doc.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: '10px 12px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)' }}>
                          <div>
                            <div style={{ fontWeight: 600 }}>{doc.label}</div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{doc.description}</div>
                          </div>
                          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            <span className={`badge ${status === 'Aprobado' ? 'approved' : status === 'Rechazado' ? 'rejected' : 'pending'}`}>
                              {status}
                            </span>
                            {match?.archivoUrl ? (
                              <div style={{ display: 'grid', gap: 8 }}>
                                <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--surface)', width: 200 }}>
                                  {isPdf(match.archivoUrl) ? (
                                    <object data={getAssetUrl(match.archivoUrl)} type="application/pdf" width="100%" height="140" aria-label="Vista previa PDF">
                                      <embed src={getAssetUrl(match.archivoUrl)} type="application/pdf" />
                                    </object>
                                  ) : isImage(match.archivoUrl) ? (
                                    <img src={getAssetUrl(match.archivoUrl)} alt={doc.label} style={{ width: '100%', height: 140, objectFit: 'cover' }} />
                                  ) : (
                                    <div style={{ padding: 12, color: 'var(--text-secondary)', fontSize: 12 }}>Formato no soportado</div>
                                  )}
                                </div>
                                <a className="link" href={getAssetUrl(match.archivoUrl)} target="_blank" rel="noopener noreferrer">Ver documento</a>
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>No cargado</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="card" style={{ padding: 12, background: 'var(--surface-light)' }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>Revision por documento</div>
                  {profileData?.documentos?.length ? (
                    <div style={{ display: 'grid', gap: 12 }}>
                      {profileData.documentos.map((doc) => (
                        <div key={doc.id} style={{ display: 'grid', gap: 10, padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                            <div>
                              <div style={{ fontWeight: 600 }}>{doc.tipo}</div>
                              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Estatus: {doc.estatus || 'Pendiente'}</div>
                            </div>
                            <a className="link" href={getAssetUrl(doc.archivoUrl)} target="_blank" rel="noopener noreferrer">Ver documento</a>
                          </div>
                          {doc.archivoUrl && (
                            <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--surface)' }}>
                              {isPdf(doc.archivoUrl) ? (
                                <object data={getAssetUrl(doc.archivoUrl)} type="application/pdf" width="100%" height="180" aria-label="Vista previa PDF">
                                  <embed src={getAssetUrl(doc.archivoUrl)} type="application/pdf" />
                                </object>
                              ) : isImage(doc.archivoUrl) ? (
                                <img src={getAssetUrl(doc.archivoUrl)} alt={doc.tipo} style={{ width: '100%', height: 180, objectFit: 'cover' }} />
                              ) : (
                                <div style={{ padding: 12, color: 'var(--text-secondary)', fontSize: 12 }}>Formato no soportado</div>
                              )}
                            </div>
                          )}
                          <textarea
                            className="input"
                            rows={2}
                            placeholder="Observaciones"
                            value={docReviewNotes[doc.id] ?? doc.observaciones ?? ''}
                            onChange={(event) => setDocReviewNotes((prev) => ({ ...prev, [doc.id]: event.target.value }))}
                          />
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button className="button-primary" onClick={() => handleDocumentReview(doc.id, 'Aprobado')}>Aprobar</button>
                            <button className="button-secondary" onClick={() => handleDocumentReview(doc.id, 'Rechazado')}>Rechazar</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: 'var(--text-secondary)' }}>Sin documentos cargados.</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      <style jsx>{`
        .editModalOverlay {
          position: fixed;
          inset: 0;
          background: rgba(4, 10, 20, 0.75);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 24px;
        }

        .editModal {
          position: relative;
          width: min(760px, 94vw);
          max-height: 90vh;
          overflow: auto;
          background: var(--surface);
          padding: 28px 28px 32px;
          border-radius: 20px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 30px 60px rgba(0, 0, 0, 0.45);
        }

        .editModalClose {
          position: absolute;
          top: 14px;
          right: 14px;
          border: none;
          background: rgba(255, 255, 255, 0.08);
          color: var(--text-secondary);
          border-radius: 10px;
          width: 32px;
          height: 32px;
          cursor: pointer;
          font-size: 16px;
          transition: color 0.2s ease, background 0.2s ease;
        }

        .editModalClose:hover {
          color: var(--text-primary);
          background: rgba(255, 255, 255, 0.16);
        }

        @media (max-width: 720px) {
          .editModal {
            width: 94vw;
            padding: 20px 18px 26px;
          }
        }
      `}</style>
    </>
  );
}
