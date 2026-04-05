"use client";


import { RoleGuard } from '../../../../components/RoleGuard';
import dynamic from "next/dynamic";
const UserForm = dynamic(() => import("./UserForm"), { ssr: false });
const ListUsers = dynamic(() => import("./list-users"), { ssr: false });

import { useUser } from '@/components/UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';
import HelpTab from '@/components/HelpTab';

export default function UsersPage() {
  const { user } = useUser();
  return (
    <RoleGuard permissions={[PERMISSIONS.USERS_MANAGE]}>
      <div className="pageHdr">
        <div className="pageHdrIcon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </div>
        <div>
          <h2 className="pageHdrTitle">Gestión de Usuarios</h2>
          <p className="pageHdrSub">Administra accesos, roles y documentos del equipo</p>
        </div>
      </div>

      {hasPermission(user, PERMISSIONS.USERS_MANAGE) && (
        <section className="createSection">
          <p className="createSectionLabel">Nuevo usuario</p>
          <UserForm />
        </section>
      )}

      <ListUsers />
      <HelpTab module="users" user={user} />

      <style jsx>{`
        .pageHdr {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 32px;
        }
        .pageHdrIcon {
          width: 52px;
          height: 52px;
          border-radius: 14px;
          flex-shrink: 0;
          background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
          display: grid;
          place-items: center;
          color: #fff;
          box-shadow: 0 8px 20px rgba(15, 106, 214, 0.28);
        }
        .pageHdrTitle {
          margin: 0 0 4px;
          font-size: 1.85rem;
          font-weight: 700;
          color: var(--primary);
        }
        .pageHdrSub {
          margin: 0;
          color: var(--text-secondary);
          font-size: 0.88rem;
        }
        .createSection {
          margin-bottom: 32px;
          padding: 24px 24px 28px;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.07);
          background: linear-gradient(
            160deg,
            color-mix(in srgb, var(--surface) 95%, var(--primary) 5%) 0%,
            var(--surface-2) 100%
          );
          box-shadow: var(--elev-1);
        }
        .createSectionLabel {
          font-weight: 700;
          font-size: 0.74rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--primary);
          margin: 0 0 18px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .createSectionLabel::before {
          content: '';
          display: inline-block;
          width: 3px;
          height: 14px;
          border-radius: 2px;
          background: var(--primary);
        }
      `}</style>
    </RoleGuard>
  );
}
