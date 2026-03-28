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
      <div className="usersPageShell">
        <section className="usersSection usersCreateSection">
          <div className="usersSectionHeader">
            <p className="usersSectionEyebrow">Administracion</p>
            <h1 className="usersSectionTitle">Alta de usuarios</h1>
            <p className="usersSectionDescription">Registra cuentas nuevas con su rol, permisos y fotografia de perfil.</p>
          </div>
          {hasPermission(user, PERMISSIONS.USERS_MANAGE) && <UserForm showHeader={false} />}
        </section>

        <section className="usersSection usersListSection">
          <div className="usersSectionHeader">
            <p className="usersSectionEyebrow">Control operativo</p>
            <h2 className="usersListTitle">Usuarios registrados</h2>
          </div>
          <ListUsers />
        </section>
      </div>
      <HelpTab module="users" user={user} />

      <style jsx>{`
        .usersPageShell {
          display: grid;
          gap: 18px;
          padding-bottom: 16px;
        }

        .usersSection {
          border: 1px solid color-mix(in srgb, var(--border) 78%, transparent);
          border-radius: 20px;
          padding: 16px;
          background: linear-gradient(170deg, color-mix(in srgb, var(--surface) 99%, transparent), color-mix(in srgb, var(--surface-2) 88%, transparent));
          box-shadow: 0 20px 36px -28px color-mix(in srgb, var(--foreground) 42%, transparent);
          position: relative;
          overflow: hidden;
        }

        .usersSection::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          opacity: 0.9;
          background: linear-gradient(90deg, color-mix(in srgb, var(--primary) 84%, white), color-mix(in srgb, var(--secondary) 78%, white));
        }

        .usersCreateSection {
          border-color: color-mix(in srgb, var(--primary) 26%, var(--border));
        }

        .usersSectionHeader {
          display: grid;
          gap: 4px;
          margin-bottom: 14px;
        }

        .usersSectionEyebrow {
          margin: 0;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.11em;
          font-weight: 760;
          color: var(--text-tertiary);
        }

        .usersSectionTitle {
          margin: 0;
          font-size: clamp(26px, 3.4vw, 34px);
          line-height: 1.08;
          color: var(--foreground);
          font-family: var(--font-heading);
          letter-spacing: var(--panel-title-tracking);
        }

        .usersSectionDescription {
          margin: 0;
          color: var(--text-secondary);
          font-size: 14px;
          line-height: 1.45;
          max-width: 58ch;
        }

        .usersListTitle {
          margin: 0;
          font-size: clamp(20px, 2.4vw, 26px);
          line-height: 1.15;
          color: var(--foreground);
          font-family: var(--font-heading);
          letter-spacing: var(--panel-title-tracking);
        }

        @media (max-width: 700px) {
          .usersPageShell {
            gap: 14px;
          }

          .usersSection {
            border-radius: 16px;
            padding: 14px;
          }

          .usersSectionTitle {
            font-size: 1.95rem;
          }

          .usersListTitle {
            font-size: 1.42rem;
          }
        }
      `}</style>
    </RoleGuard>
  );
}
