"use client";
import React, { useEffect, useState } from "react";
import UserForm from "./UserForm";
import { useUser } from '@/components/UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';
import { resolveUserAvatarUrl } from '@/lib/user-avatar';
import { buildApiUrl } from '@/lib/api-base';
import { openExternalUrl } from "@/lib/open-external-url";


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
  const [brokenAvatarIds, setBrokenAvatarIds] = useState<Record<number, boolean>>({});
  const { user } = useUser();

  const normalizeDocumentKey = (raw: string) => {
    const baseKey = raw.toLowerCase().trim();
    if (baseKey === 'constancia situacion fiscal') return 'constancia de situacion fiscal';
    if (baseKey === 'comprobante domicilio') return 'comprobante de domicilio';
    if (baseKey === 'licencia') return 'licencia de conducir';
    if (baseKey === 'contrato') return 'contrato o alta';
    return baseKey;
  };

  const getAssetUrl = (url?: string | null) => resolveUserAvatarUrl(url);

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
        setBrokenAvatarIds({});
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
      <div style={tableWrapStyle}>
        <table className="table">
          <colgroup>
            <col style={{ width: "82px" }} />
            <col style={{ width: "27%" }} />
            <col style={{ width: "24%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "15%" }} />
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
                  {u.avatarUrl && !brokenAvatarIds[u.id] ? (
                    <img
                      src={getAssetUrl(u.avatarUrl)}
                      alt={u.nombre}
                      width={40}
                      height={40}
                      style={{ borderRadius: "50%", objectFit: "cover" }}
                      onError={() => setBrokenAvatarIds((prev) => ({ ...prev, [u.id]: true }))}
                    />
                  ) : (
                    <span style={{ width: 40, height: 40, display: "inline-block", borderRadius: "50%", background: "var(--muted)", textAlign: "center", lineHeight: "40px", color: "var(--primary)", fontWeight: 700 }}>
                      {u.nombre[0]}
                    </span>
                  )}
                </td>
                <td data-label="Nombre">{u.nombre}</td>
                <td data-label="Email">{u.email}</td>
                <td data-label="Rol">{u.role?.nombre}</td>
                <td data-label="Departamento">{u.department?.nombre}</td>
                <td data-label="Perfil" className="tableProfileCell">
                  {hasPermission(user, PERMISSIONS.USERS_REVIEW) ? (
                    <button
                      className="tableAction tableActionInfo"
                      onClick={() => handleViewProfile(u)}
                    >
                      Ver información
                    </button>
                  ) : (
                    <span style={{ color: 'var(--muted)', fontSize: 12 }}>Sin permisos</span>
                  )}
                </td>
                <td data-label="Acciones" className="tableActionsCell">
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
        <div className="profileModalOverlay" role="dialog" aria-modal="true">
          <div className="profileModal">
            <button onClick={() => setProfileModalOpen(false)} className="profileModalClose" aria-label="Cerrar">✕</button>
            <div className="profileModalHeader">
              {profileUser?.avatarUrl && !brokenAvatarIds[profileUser.id] ? (
                <img
                  src={getAssetUrl(profileUser.avatarUrl)}
                  alt={profileUser.nombre}
                  width={56}
                  height={56}
                  style={{ borderRadius: '50%', objectFit: 'cover' }}
                  onError={() => setBrokenAvatarIds((prev) => ({ ...prev, [profileUser.id]: true }))}
                />
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
                                <button
                                  type="button"
                                  className="link"
                                  onClick={() => void openExternalUrl(getAssetUrl(match.archivoUrl))}
                                >
                                  Ver documento
                                </button>
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
                            <button
                              type="button"
                              className="link"
                              onClick={() => void openExternalUrl(getAssetUrl(doc.archivoUrl))}
                            >
                              Ver documento
                            </button>
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
          border-collapse: separate;
          border-spacing: 0;
          table-layout: fixed;
          border-radius: 12px;
          overflow: hidden;
        }

        .usersTable thead th {
          background: linear-gradient(135deg, color-mix(in srgb, var(--primary) 18%, var(--surface)) 0%, color-mix(in srgb, var(--secondary) 14%, var(--surface-2)) 100%);
          color: var(--foreground);
          border-bottom: 1px solid var(--border);
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          font-size: 0.76rem;
          white-space: nowrap;
          text-align: left;
          padding: 13px 14px;
        }

        .usersTable tbody td {
          color: var(--text-primary);
          border-bottom-color: color-mix(in srgb, var(--border) 82%, transparent);
          overflow-wrap: anywhere;
          vertical-align: middle;
          line-height: 1.45;
          text-align: left;
          padding: 13px 14px;
        }

        .usersTable tbody tr:nth-child(even) {
          background: color-mix(in srgb, var(--surface-2) 76%, transparent);
        }

        .usersTable tbody tr:hover {
          background: linear-gradient(90deg, color-mix(in srgb, var(--primary) 10%, transparent), color-mix(in srgb, var(--secondary) 8%, transparent));
        }

        .tableAction {
          border-radius: 9px;
          padding: 7px 12px;
          font-weight: 600;
          font-size: 0.84rem;
          cursor: pointer;
          transition: background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease, transform 0.18s ease;
          color: var(--foreground);
          border: 1px solid var(--border);
          background: color-mix(in srgb, var(--surface) 92%, transparent);
          box-shadow: none;
        }

        .tableAction:hover {
          background: color-mix(in srgb, var(--surface-2) 92%, transparent);
          border-color: var(--border-strong);
          transform: translateY(-1px);
        }

        .tableAction:focus-visible {
          outline: 2px solid var(--focus);
          outline-offset: 1px;
        }

        .tableActionInfo {
          background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
          border-color: color-mix(in srgb, var(--primary) 36%, transparent);
          color: var(--header-text);
        }

        .tableActionEdit {
          background: color-mix(in srgb, var(--surface) 88%, var(--primary) 12%);
          border-color: color-mix(in srgb, var(--primary) 28%, var(--border));
        }

        .tableActionDelete {
          background: var(--state-danger-bg);
          border-color: var(--state-danger-border);
          color: var(--state-danger-text);
        }

        .tableProfileCell,
        .tableActionsCell {
          text-align: left;
          white-space: nowrap;
        }

        .tableActionsCell .tableAction + .tableAction {
          margin-left: 8px;
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
            padding: 12px;
            border-radius: 12px;
            border: 1px solid var(--border);
            background: linear-gradient(180deg, color-mix(in srgb, var(--surface) 97%, transparent), color-mix(in srgb, var(--surface-2) 88%, transparent));
            box-shadow: var(--elev-1);
          }

          .usersTable tbody td {
            border: none;
            padding: 5px 0;
            line-height: 1.35;
          }

          .usersTable tbody td::before {
            content: attr(data-label);
            display: block;
            margin-bottom: 2px;
            font-size: 0.68rem;
            font-weight: 600;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: var(--primary);
          }

          .usersTable tbody td[data-label="Foto"] {
            padding-top: 0;
          }

          .usersTable tbody td[data-label="Foto"]::before {
            margin-bottom: 8px;
          }

          .tableProfileCell,
          .tableActionsCell {
            margin-top: 8px;
          }

          .tableAction {
            width: 100%;
            margin: 0 0 8px 0;
          }

          .tableActionsCell .tableAction + .tableAction {
            margin-left: 0;
          }

          .tableActionsCell .tableAction:last-child {
            margin-bottom: 0;
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
          background: rgba(3, 13, 27, 0.74);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1100;
          padding: clamp(12px, 3vw, 24px);
          backdrop-filter: blur(2px);
        }

        .profileModal {
          position: relative;
          width: min(1040px, 96vw);
          max-height: 92vh;
          overflow-y: auto;
          border-radius: 18px;
          border: 1px solid rgba(90, 148, 206, 0.42);
          background: linear-gradient(165deg, rgba(10, 33, 58, 0.98) 0%, rgba(12, 38, 66, 0.98) 55%, rgba(10, 30, 52, 0.98) 100%);
          box-shadow: 0 24px 56px rgba(1, 9, 20, 0.52);
          padding: clamp(14px, 2.6vw, 24px);
        }

        .profileModalClose {
          position: sticky;
          top: 0;
          margin-left: auto;
          display: grid;
          place-items: center;
          border: 1px solid rgba(154, 196, 236, 0.5);
          background: rgba(38, 91, 142, 0.75);
          color: #eef6ff;
          border-radius: 8px;
          width: 30px;
          height: 30px;
          cursor: pointer;
          z-index: 2;
        }

        .profileModalHeader {
          display: flex;
          align-items: center;
          gap: 14px;
          margin: 4px 0 14px;
        }

        .profileAvatarFallback {
          width: 56px;
          height: 56px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          font-weight: 700;
          color: #a7d1ff;
          background: linear-gradient(145deg, rgba(30, 73, 120, 0.85), rgba(20, 54, 92, 0.9));
          border: 1px solid rgba(107, 159, 211, 0.4);
        }

        .profileTitle {
          margin: 0 0 2px;
          font-size: 1.55rem;
        }

        .profileSubtitle {
          color: #d0e6ff;
          font-size: 0.86rem;
        }

        .profileRole {
          color: #9bc8f5;
          font-size: 0.8rem;
          margin-top: 2px;
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
          background: rgba(23, 54, 89, 0.72);
          border: 1px solid rgba(88, 142, 196, 0.38);
          border-radius: 14px;
          padding: 12px;
          box-shadow: inset 0 1px 0 rgba(167, 206, 246, 0.12);
        }

        .profileSectionTitle {
          font-weight: 700;
          letter-spacing: 0.02em;
          margin-bottom: 8px;
        }

        .profileStatusRow {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
          margin-bottom: 8px;
        }

        .profileMetaText {
          color: #b7d6f5;
          font-size: 12px;
        }

        .profileHintText {
          color: #9fc4e9;
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
          align-items: center;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid rgba(80, 132, 186, 0.36);
          background: rgba(12, 35, 61, 0.8);
        }

        .profileDocumentActions {
          display: flex;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .profileDocReviewCard {
          display: grid;
          gap: 10px;
          padding: 12px 14px;
          border-radius: 12px;
          border: 1px solid rgba(79, 132, 186, 0.38);
          background: rgba(11, 33, 56, 0.78);
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
          border: 1px solid rgba(90, 139, 187, 0.36);
          background: rgba(8, 25, 43, 0.9);
        }

        .profileDocPreviewSmall {
          width: 200px;
        }

        @media (max-width: 720px) {
          .usersTable {
            font-size: 0.84rem;
          }

          .usersTable thead th,
          .usersTable tbody td {
            padding: 9px 8px;
          }

          .editModal {
            width: 94vw;
            padding: 20px 18px 26px;
          }

          .profileModal {
            width: 96vw;
            border-radius: 14px;
          }

          .profileTitle {
            font-size: 1.2rem;
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
        }
      `}</style>
    </>
  );
}

