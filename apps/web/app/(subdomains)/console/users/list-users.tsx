"use client";
import React, { useEffect, useState } from "react";
import UserForm from "./UserForm";
import Image from "next/image";
import { useUser } from '@/components/UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';
import { getApiAssetOrigin } from '@/lib/api-base';

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
  employeeNumber?: string;
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

  const API_ASSET_ORIGIN = getApiAssetOrigin();
  const getAssetUrl = (url?: string | null) => {
    if (!url) return '';
    const value = String(url).trim().replace(/\\/g, '/');
    if (/^(data:|blob:|\/\/)/i.test(value)) return value;
    if (/^https?:\/\//i.test(value)) {
      try {
        const parsed = new URL(value);
        const normalizedPath = parsed.pathname.replace(/^\/api(?=\/uploads\/)/i, '');
        if (normalizedPath.startsWith('/uploads/')) {
          return `${API_ASSET_ORIGIN}${normalizedPath}${parsed.search}`;
        }
      } catch {
        // Keep original URL if parsing fails.
      }
      return value;
    }
    const normalizedPath = (value.startsWith('/') ? value : `/${value}`).replace(/^\/api(?=\/uploads\/)/i, '');
    return `${API_ASSET_ORIGIN}${normalizedPath}`;
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
        const rawUsers = Array.isArray(data)
          ? data
          : Array.isArray(data?.data)
            ? data.data
            : Array.isArray(data?.items)
              ? data.items
              : [];

        const filtered = rawUsers.filter((item: any) => {
              const email = String(item?.email || '').toLowerCase();
              return email !== 'gerencia@nexara.com.mx' && email !== 'developer@nexara.com.mx';
            });
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

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '52px 0', color: 'var(--text-secondary)', fontSize: 14, opacity: 0.75 }}>
      Cargando usuarios…
    </div>
  );

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
      alert('No tienes permisos para ver la información de este usuario.');
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
      const notesByDocument = Object.fromEntries(
        (data?.documentos || []).map((doc: { id: number; observaciones?: string | null }) => [doc.id, doc.observaciones || ''])
      ) as Record<number, string>;
      setDocReviewNotes(notesByDocument);
    } catch {
      setProfileData(null);
      setDocReviewNotes({});
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
    const docNote = (docReviewNotes[docId] || '').trim();
    if (estatus === 'Rechazado' && !docNote) {
      alert('Agrega observaciones para rechazar este documento.');
      return;
    }
    const res = await fetch(buildApiUrl(`users/documents/${docId}/review`), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.token}`,
      },
      body: JSON.stringify({
        estatus,
        observaciones: docNote,
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
      const text = await res.text();
      let message = "Error al actualizar usuario";
      try {
        const data = JSON.parse(text);
        if (Array.isArray(data?.message) && data.message.length) {
          message = String(data.message[0]);
        } else if (typeof data?.message === "string" && data.message.trim()) {
          message = data.message;
        }
      } catch {
        if (text?.trim()) message = text;
      }
      alert(message);
    }
  };

  const tableWrapStyle: React.CSSProperties = {
    width: "100%",
    overflowX: "auto",
    overflowY: "hidden",
    WebkitOverflowScrolling: "touch",
    marginTop: 32,
    borderRadius: 16,
    border: "1px solid var(--border)",
    background: "linear-gradient(180deg, color-mix(in srgb, var(--surface) 98%, transparent) 0%, color-mix(in srgb, var(--surface-2) 90%, transparent) 100%)",
    boxShadow: "var(--elev-1)",
    backdropFilter: "blur(4px)",
  };

  return (
    <>
      <div className="tableToolbar">
        <span className="userCountChip">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
          </svg>
          {users.length} {users.length === 1 ? 'usuario' : 'usuarios'}
        </span>
      </div>
      <div style={tableWrapStyle}>
        <table className="usersTable">
          <colgroup>
            <col style={{ width: "82px" }} />
            <col style={{ width: "25%" }} />
            <col style={{ width: "23%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "16%" }} />
          </colgroup>
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
                <td data-label="Foto">
                  {u.avatarUrl ? (
                    <Image src={getAssetUrl(u.avatarUrl)} alt={u.nombre} width={48} height={48} className="avatarImg" unoptimized />
                  ) : (
                    <span className="avatarFallback">{u.nombre[0]}</span>
                  )}
                </td>
                <td data-label="Nombre">
                  <div className="nameCell">
                    <span className="nameMain">{u.nombre}</span>
                    <span className="nameSub">{u.employeeNumber || `NXR25SYS${String(u.id).padStart(3, '0')}`}</span>
                  </div>
                </td>
                <td data-label="Email"><span className="emailText">{u.email}</span></td>
                <td data-label="Rol"><span className="rolePill">{u.role?.nombre || '—'}</span></td>
                <td data-label="Departamento"><span className="departmentText">{u.department?.nombre || 'Sin departamento'}</span></td>
                <td data-label="Perfil" className="tableProfileCell">
                  {hasPermission(user, PERMISSIONS.USERS_REVIEW) ? (
                    <span className="profileAvailability">Disponible</span>
                  ) : (
                    <span className="profileAvailability profileAvailabilityMuted">Sin acceso</span>
                  )}
                </td>
                <td data-label="Acciones" className="tableActionsCell">
                  {(hasPermission(user, PERMISSIONS.USERS_REVIEW) || (user && hasPermission(user, PERMISSIONS.USERS_MANAGE) && (!user.isSuperAdmin && u.department?.id ? user.departmentId === u.department.id : true))) && (
                    <div className="tableActionsGroup">
                      {hasPermission(user, PERMISSIONS.USERS_REVIEW) && (
                        <button
                          className="tableAction tableActionInfo"
                          onClick={() => handleViewProfile(u)}
                        >
                          Ver información
                        </button>
                      )}
                      {user && hasPermission(user, PERMISSIONS.USERS_MANAGE) && (!user.isSuperAdmin && u.department?.id ? user.departmentId === u.department.id : true) && (
                        <>
                      <button
                        className="tableAction tableActionEdit"
                        onClick={() => handleEdit(u)}
                      >
                        Editar
                      </button>
                      <button
                        className="tableAction tableActionDelete"
                        onClick={() => handleDelete(u.id)}
                      >
                        Eliminar
                      </button>
                        </>
                      )}
                    </div>
                  )}
                  {!hasPermission(user, PERMISSIONS.USERS_REVIEW) && !hasPermission(user, PERMISSIONS.USERS_MANAGE) && (
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
        <div className="profileModalOverlay" role="dialog" aria-modal="true">
          <div className="profileModal">
            <button onClick={() => setProfileModalOpen(false)} className="profileModalClose" aria-label="Cerrar">✕</button>
            <div className="profileModalHeader">
              {profileUser?.avatarUrl ? (
                <Image src={getAssetUrl(profileUser.avatarUrl)} alt={profileUser.nombre} width={56} height={56} style={{ borderRadius: '50%', objectFit: 'cover' }} unoptimized />
              ) : (
                <div className="profileAvatarFallback">
                  {profileUser?.nombre?.[0] || 'U'}
                </div>
              )}
              <div>
                <h3 className="profileTitle">{profileUser?.nombre}</h3>
                <div className="profileSubtitle">{profileUser?.email}</div>
                <div className="profileRole">
                  {profileUser?.role?.nombre}
                </div>
              </div>
            </div>
            {profileLoading && <div>Cargando perfil...</div>}
            {!profileLoading && (
              <div className="profileModalBody">
                <div className="profileGrid">
                  <div className="profileCard">
                    <div className="profileSectionTitle">Estado de perfil</div>
                    <div className="profileStatusRow">
                      <span className={`badge ${profileData?.perfil?.estatus === 'Aprobado' ? 'approved' : profileData?.perfil?.estatus === 'Rechazado' ? 'rejected' : 'pending'}`}>
                        {profileData?.perfil?.estatus || 'Pendiente'}
                      </span>
                      {profileData?.perfil?.observaciones && (
                        <span className="profileMetaText">{profileData.perfil.observaciones}</span>
                      )}
                    </div>
                    <textarea
                      className="input"
                      rows={2}
                      placeholder="Observaciones generales del perfil"
                      value={profileReviewNote}
                      onChange={(event) => setProfileReviewNote(event.target.value)}
                    />
                    <div className="profileHintText">El rechazo y observaciones de documentos se realiza por cada documento.</div>
                    <div className="profileActionRow">
                      <button className="button-primary" onClick={() => handleProfileReview('Aprobado')}>Aprobar información general</button>
                    </div>
                  </div>
                  <div className="profileCard">
                    <div className="profileSectionTitle">Datos personales</div>
                    <div>No. de Empleado: {profileUser?.employeeNumber || (profileUser?.id ? `NXR25SYS${String(profileUser.id).padStart(3, '0')}` : '-')}</div>
                    <div>Teléfono: {profileData?.perfil?.telefono || '-'}</div>
                    <div>Fecha nacimiento: {profileData?.perfil?.fechaNacimiento || '-'}</div>
                    <div>CURP: {profileData?.perfil?.curp || '-'}</div>
                    <div>RFC: {profileData?.perfil?.rfc || '-'}</div>
                    <div>INE: {profileData?.perfil?.ineNumero || '-'}</div>
                    <div>NSS: {profileData?.perfil?.nss || '-'}</div>
                  </div>
                  <div className="profileCard">
                    <div className="profileSectionTitle">Dirección</div>
                    <div>{profileData?.perfil?.direccion || '-'}</div>
                    <div>{profileData?.perfil?.colonia || '-'} | {profileData?.perfil?.codigoPostal || '-'}</div>
                    <div>{profileData?.perfil?.ciudad || '-'}, {profileData?.perfil?.estado || '-'}</div>
                    <div>{profileData?.perfil?.pais || '-'}</div>
                  </div>
                  <div className="profileCard">
                    <div className="profileSectionTitle">Contacto de emergencia</div>
                    <div>{profileData?.perfil?.contactoEmergenciaNombre || '-'}</div>
                    <div>{profileData?.perfil?.contactoEmergenciaTelefono || '-'}</div>
                  </div>
                </div>

                <div className="profileCard">
                  <div className="profileSectionTitle">Documentos (PDF)</div>
                  <div className="profileDocumentsList">
                    {requiredDocuments.map((doc) => {
                      const match = profileData?.documentos?.find((item) => normalizeDocumentKey(item.tipo) === doc.key.toLowerCase().trim());
                      const status = match?.estatus || 'Pendiente';
                      return (
                        <div key={doc.key} className="profileDocumentRow">
                          <div>
                            <div style={{ fontWeight: 600 }}>{doc.label}</div>
                            <div className="profileMetaText">{doc.description}</div>
                          </div>
                          <div className="profileDocumentActions">
                            <span className={`badge ${status === 'Aprobado' ? 'approved' : status === 'Rechazado' ? 'rejected' : 'pending'}`}>
                              {status}
                            </span>
                            {match?.archivoUrl ? (
                              <div style={{ display: 'grid', gap: 8 }}>
                                <div className="profileDocPreview profileDocPreviewSmall">
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

                <div className="profileCard">
                  <div className="profileSectionTitle">Revision por documento</div>
                  {profileData?.documentos?.length ? (
                    <div style={{ display: 'grid', gap: 12 }}>
                      {profileData.documentos.map((doc) => (
                        <div key={doc.id} className="profileDocReviewCard">
                          <div className="profileDocReviewHeader">
                            <div>
                              <div style={{ fontWeight: 600 }}>{doc.tipo}</div>
                              <div className="profileMetaText">Estatus: {doc.estatus || 'Pendiente'}</div>
                            </div>
                            <a className="link" href={getAssetUrl(doc.archivoUrl)} target="_blank" rel="noopener noreferrer">Ver documento</a>
                          </div>
                          {doc.archivoUrl && (
                            <div className="profileDocPreview">
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
                            placeholder="Observaciones del documento"
                            value={docReviewNotes[doc.id] ?? ''}
                            onChange={(event) => setDocReviewNotes((prev) => ({ ...prev, [doc.id]: event.target.value }))}
                          />
                          <div className="profileActionRow">
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
        .usersTable {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          border-radius: 12px;
          overflow: hidden;
          background: color-mix(in srgb, var(--surface) 96%, transparent);
        }

        .usersTable thead th {
          background: color-mix(in srgb, var(--surface-2) 84%, var(--primary) 16%);
          color: var(--foreground);
          border-bottom: 1px solid color-mix(in srgb, var(--border) 86%, transparent);
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          font-size: 0.72rem;
          text-align: left;
          padding: 13px 16px;
          white-space: nowrap;
        }

        .usersTable tbody td {
          color: var(--text-primary);
          border-bottom: 1px solid color-mix(in srgb, var(--border) 84%, transparent);
          overflow-wrap: anywhere;
          vertical-align: middle;
          line-height: 1.4;
          text-align: left;
          padding: 13px 16px;
          background: transparent;
        }

        .usersTable tbody tr:nth-child(even) {
          background: color-mix(in srgb, var(--surface-2) 72%, transparent);
        }

        .usersTable tbody tr:hover {
          background: color-mix(in srgb, var(--primary) 8%, var(--surface));
        }

        .tableAction {
          border-radius: 8px;
          padding: 8px 12px;
          font-weight: 600;
          font-size: 0.82rem;
          cursor: pointer;
          transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease;
          color: var(--foreground);
          border: 1px solid color-mix(in srgb, var(--border) 92%, transparent);
          background: color-mix(in srgb, var(--surface) 95%, transparent);
        }

        .tableAction:hover {
          border-color: color-mix(in srgb, var(--primary) 30%, var(--border));
          background: color-mix(in srgb, var(--surface-2) 94%, transparent);
        }

        .tableAction:focus-visible {
          outline: 2px solid var(--focus);
          outline-offset: 1px;
        }

        .tableActionInfo {
          background: color-mix(in srgb, var(--primary) 85%, white 15%);
          border-color: color-mix(in srgb, var(--primary) 45%, transparent);
          color: #fff;
        }

        .tableActionEdit {
          background: color-mix(in srgb, var(--surface) 92%, var(--primary) 8%);
          border-color: color-mix(in srgb, var(--primary) 24%, var(--border));
        }

        .tableActionDelete {
          background: var(--state-danger-bg);
          border-color: var(--state-danger-border);
          color: var(--state-danger-text);
        }

        .tableProfileCell,
        .tableActionsCell {
          text-align: left;
          white-space: normal;
        }

        .tableActionsGroup {
          display: inline-flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
        }

        .profileAvailability {
          font-size: 0.82rem;
          font-weight: 600;
          color: var(--text-primary);
        }

        .profileAvailabilityMuted {
          color: var(--text-secondary);
          font-weight: 500;
        }

        .tableActionsGroup .tableAction {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 88px;
          white-space: nowrap;
        }

        .tableProfileCell .tableAction {
          white-space: nowrap;
        }

        .nameCell {
          display: grid;
        }

        .nameMain {
          font-weight: 700;
          font-size: 1rem;
          line-height: 1.2;
          color: var(--text-primary);
        }

        .emailText {
          font-size: 0.93rem;
          color: var(--text-primary);
          word-break: break-word;
        }

        .rolePill {
          display: inline-flex;
          align-items: center;
          padding: 3px 10px;
          border-radius: 999px;
          font-size: 0.78rem;
          font-weight: 600;
          background: color-mix(in srgb, var(--primary) 8%, var(--surface));
          border: 1px solid color-mix(in srgb, var(--primary) 18%, var(--border));
          color: var(--text-primary);
          max-width: 100%;
          white-space: normal;
          overflow: visible;
          text-overflow: clip;
          overflow-wrap: normal;
          word-break: normal;
          line-height: 1.2;
        }

        .usersTable td[data-label="Rol"] {
          overflow-wrap: normal;
          word-break: normal;
        }

        .departmentText {
          font-size: 0.9rem;
          color: var(--text-primary);
        }

        .tableToolbar {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
          flex-wrap: wrap;
        }

        .userCountChip {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 6px 13px;
          border-radius: 999px;
          font-size: 0.76rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          background: color-mix(in srgb, var(--surface-2) 86%, var(--primary) 14%);
          border: 1px solid color-mix(in srgb, var(--primary) 22%, var(--border));
          color: var(--primary);
        }

        .avatarImg {
          border-radius: 50%;
          object-fit: cover;
          border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.16);
          display: block;
        }

        .avatarFallback {
          width: 44px;
          height: 44px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          background: color-mix(in srgb, var(--primary) 20%, var(--surface));
          border: 1px solid color-mix(in srgb, var(--primary) 20%, var(--border));
          color: var(--primary);
          font-weight: 700;
          font-size: 1rem;
          flex-shrink: 0;
        }

        @media (max-width: 760px) {
          .usersTable thead {
            display: none;
          }

          .usersTable,
          .usersTable tbody,
          .usersTable tr,
          .usersTable td {
            display: block;
            width: 100%;
          }

          .usersTable tbody tr {
            margin-bottom: 10px;
            border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
            border-radius: 10px;
            background: color-mix(in srgb, var(--surface) 98%, transparent);
            overflow: hidden;
          }

          .usersTable tbody td {
            border: none;
            border-bottom: 1px solid color-mix(in srgb, var(--border) 84%, transparent);
            padding: 9px 10px;
            line-height: 1.35;
            margin-bottom: 0;
          }

          .usersTable tbody td:last-child {
            border-bottom: none;
          }

          .usersTable tbody td::before {
            content: attr(data-label);
            display: block;
            margin-bottom: 2px;
            font-size: 0.67rem;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: var(--primary);
          }

          .tableProfileCell,
          .tableActionsCell {
            margin-top: 4px;
            white-space: normal;
          }

          .tableActionsGroup {
            display: grid;
            width: 100%;
            gap: 8px;
          }

          .tableAction {
            width: 100%;
          }
        }

        .editModalOverlay {
          position: fixed;
          inset: 0;
          background: rgba(4, 10, 20, 0.75);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: clamp(12px, 3vw, 24px);
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

        .profileModalOverlay {
          position: fixed;
          inset: 0;
          background: rgba(8, 16, 28, 0.56);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1100;
          padding: clamp(12px, 3vw, 24px);
          backdrop-filter: blur(4px);
        }

        .profileModal {
          position: relative;
          width: min(1080px, 96vw);
          max-height: 92vh;
          overflow-y: auto;
          border-radius: 18px;
          border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
          background: linear-gradient(
            180deg,
            color-mix(in srgb, var(--surface) 98%, white 2%) 0%,
            color-mix(in srgb, var(--surface-2) 95%, transparent) 100%
          );
          box-shadow: 0 22px 50px rgba(4, 12, 26, 0.38);
          padding: clamp(16px, 2.6vw, 26px);
        }

        .profileModalClose {
          position: absolute;
          top: 14px;
          right: 14px;
          display: grid;
          place-items: center;
          border: 1px solid color-mix(in srgb, var(--border) 85%, transparent);
          background: color-mix(in srgb, var(--surface) 92%, transparent);
          color: var(--text-secondary);
          border-radius: 10px;
          width: 32px;
          height: 32px;
          cursor: pointer;
          transition: border-color 0.18s ease, color 0.18s ease, background 0.18s ease;
          z-index: 2;
        }

        .profileModalClose:hover {
          color: var(--text-primary);
          border-color: color-mix(in srgb, var(--primary) 28%, var(--border));
          background: color-mix(in srgb, var(--surface-2) 92%, transparent);
        }

        .profileModalHeader {
          display: flex;
          align-items: center;
          gap: 14px;
          margin: 0 0 18px;
          padding: 0 42px 14px 0;
          border-bottom: 1px solid color-mix(in srgb, var(--border) 78%, transparent);
        }

        .profileAvatarFallback {
          width: 56px;
          height: 56px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          font-weight: 700;
          color: var(--primary);
          background: color-mix(in srgb, var(--primary) 14%, var(--surface));
          border: 1px solid color-mix(in srgb, var(--primary) 24%, var(--border));
        }

        .profileTitle {
          margin: 0 0 3px;
          font-size: clamp(1.2rem, 1.8vw, 1.5rem);
          color: var(--text-primary);
          line-height: 1.2;
        }

        .profileSubtitle {
          color: var(--text-secondary);
          font-size: 0.88rem;
          word-break: break-word;
        }

        .profileRole {
          color: var(--primary);
          font-size: 0.8rem;
          margin-top: 4px;
          font-weight: 600;
        }

        .profileModalBody {
          display: grid;
          gap: 14px;
        }

        .profileGrid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 12px;
        }

        .profileCard {
          background: color-mix(in srgb, var(--surface) 95%, transparent);
          border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
          border-radius: 12px;
          padding: 12px;
          box-shadow: 0 1px 0 rgba(255, 255, 255, 0.06) inset;
          color: var(--text-primary);
        }

        .profileSectionTitle {
          font-weight: 700;
          letter-spacing: 0.02em;
          margin-bottom: 8px;
          color: var(--text-primary);
        }

        .profileStatusRow {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
          margin-bottom: 8px;
        }

        .profileMetaText {
          color: var(--text-secondary);
          font-size: 12px;
        }

        .profileHintText {
          color: var(--text-secondary);
          font-size: 12px;
          margin-top: 8px;
        }

        .profileActionRow {
          display: flex;
          gap: 8px;
          margin-top: 8px;
          flex-wrap: wrap;
        }

        .profileDocumentsList {
          display: grid;
          gap: 10px;
        }

        .profileDocumentRow {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
          background: color-mix(in srgb, var(--surface-2) 84%, transparent);
        }

        .profileDocumentActions {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .profileDocReviewCard {
          display: grid;
          gap: 10px;
          padding: 12px 14px;
          border-radius: 10px;
          border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
          background: color-mix(in srgb, var(--surface) 95%, transparent);
        }

        .profileDocReviewHeader {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }

        .profileDocPreview {
          border-radius: 10px;
          overflow: hidden;
          border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
          background: color-mix(in srgb, var(--surface-2) 86%, transparent);
        }

        .profileDocPreviewSmall {
          width: 200px;
        }

        .profileModal .input {
          background: color-mix(in srgb, var(--surface) 96%, transparent);
          border: 1px solid color-mix(in srgb, var(--border) 84%, transparent);
          color: var(--text-primary);
        }

        .profileModal .input::placeholder {
          color: color-mix(in srgb, var(--text-secondary) 88%, transparent);
        }

        .badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border-radius: 999px;
          padding: 4px 10px;
          font-size: 0.74rem;
          font-weight: 700;
          letter-spacing: 0.02em;
        }

        .badge.approved {
          color: #0f7d52;
          background: rgba(38, 189, 132, 0.14);
          border: 1px solid rgba(38, 189, 132, 0.34);
        }

        .badge.pending {
          color: #856404;
          background: rgba(255, 193, 7, 0.18);
          border: 1px solid rgba(255, 193, 7, 0.34);
        }

        .badge.rejected {
          color: #a23434;
          background: rgba(214, 79, 79, 0.16);
          border: 1px solid rgba(214, 79, 79, 0.34);
        }

        .link {
          color: var(--primary);
          text-decoration: none;
          font-size: 0.83rem;
          font-weight: 600;
        }

        .link:hover {
          text-decoration: underline;
        }

        .button-primary,
        .button-secondary {
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 0.82rem;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease;
          border: 1px solid transparent;
        }

        .button-primary {
          color: #fff;
          background: color-mix(in srgb, var(--primary) 86%, white 14%);
          border-color: color-mix(in srgb, var(--primary) 42%, transparent);
        }

        .button-primary:hover {
          background: color-mix(in srgb, var(--primary) 80%, white 20%);
        }

        .button-secondary {
          color: var(--state-danger-text);
          background: var(--state-danger-bg);
          border-color: var(--state-danger-border);
        }

        .button-secondary:hover {
          background: color-mix(in srgb, var(--state-danger-bg) 85%, white 15%);
        }

        @media (max-width: 720px) {
          .editModal {
            width: 94vw;
            padding: 20px 18px 26px;
          }

          .profileModal {
            width: 96vw;
            border-radius: 14px;
            padding: 14px;
          }

          .profileModalHeader {
            padding-right: 34px;
            align-items: flex-start;
          }

          .profileTitle {
            font-size: 1.2rem;
          }

          .profileSubtitle {
            font-size: 0.82rem;
          }

          .profileDocumentRow {
            flex-direction: column;
            align-items: flex-start;
          }

          .profileDocumentActions {
            width: 100%;
            justify-content: flex-start;
          }

          .profileDocPreviewSmall {
            width: 100%;
          }

          .profileActionRow .button-primary,
          .profileActionRow .button-secondary {
            width: 100%;
          }
        }
      `}</style>
    </>
  );
}

