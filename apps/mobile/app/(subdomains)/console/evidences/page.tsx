"use client";
import EvidenceTable from '@/components/EvidenceTable';
import ActivityEvidenceFlow from '@/components/ActivityEvidenceFlow';
import { RoleGuard } from '../../../../components/RoleGuard';
import { useUser } from '../../../../components/UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';
import HelpTab from '@/components/HelpTab';

export default function EvidencesPage() {
  const { user } = useUser();
  const isAdmin = hasPermission(user, PERMISSIONS.CONSOLE_ADMIN);
  const isSuperAdmin = user?.isSuperAdmin;

  return (
    <RoleGuard permissions={[PERMISSIONS.CONSOLE_ACCESS]}>
      <div className="evidencesShell">
        <HelpTab module="evidences" user={user} />

        <section className="evidencesHero card">
          <div className="evidencesHeroEyebrow">Control de evidencias</div>
          <h1 className="evidencesHeroTitle">Seguimiento claro para captura y revisión</h1>
          <p className="evidencesHeroText">
            Visualiza el progreso, revisa archivos y mantén el historial ordenado para trabajar bien desde pantalla pequeña.
          </p>
        </section>

        {isAdmin && (
          <section className="evidencesSection">
            <div className="evidencesSectionHeader">
              <span className="evidencesSectionEyebrow">Panel de revisión</span>
              <h2 className="evidencesSectionTitle">
                {isSuperAdmin ? 'Evidencias de todos' : 'Evidencias del equipo'}
              </h2>
              <p className="evidencesSectionText">
                Revisa estatus, ubicación, archivos y observaciones sin perder legibilidad en móvil.
              </p>
            </div>
            <EvidenceTable
              title={isSuperAdmin ? 'Evidencias de Todos - Revisión' : 'Evidencias del Equipo - Revisión'}
            />
          </section>
        )}

        {!isSuperAdmin && (
          <section className="evidencesSection">
            <div className="evidencesSectionHeader">
              <span className="evidencesSectionEyebrow">Registro personal</span>
              <h2 className="evidencesSectionTitle">Mis evidencias</h2>
              <p className="evidencesSectionText">
                Sigue el flujo completo y consulta tu historial guardado con una vista mucho más cómoda en teléfono.
              </p>
            </div>

            <div className="evidencesFlowWrap">
              <ActivityEvidenceFlow />
            </div>

            <div className="evidencesHistoryWrap">
              <EvidenceTable mode="user" title="Historial de Mis Evidencias" />
            </div>
          </section>
        )}

        <style jsx>{`
          .evidencesShell {
            display: grid;
            gap: 24px;
          }

          .evidencesHero {
            position: relative;
            overflow: hidden;
            padding: 24px;
            border-radius: 24px;
            background:
              radial-gradient(circle at top right, rgba(20, 184, 166, 0.2), transparent 40%),
              radial-gradient(circle at bottom left, rgba(8, 145, 178, 0.12), transparent 45%),
              linear-gradient(145deg, rgba(240, 252, 252, 0.98), rgba(232, 248, 249, 0.96));
            border: 1px solid rgba(8, 145, 178, 0.2);
            color: var(--text-primary);
            box-shadow: 0 18px 38px rgba(15, 23, 42, 0.1);
          }

          .evidencesHeroEyebrow,
          .evidencesSectionEyebrow {
            display: inline-flex;
            align-items: center;
            width: fit-content;
            padding: 6px 12px;
            border-radius: 999px;
            font-size: 0.72rem;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.08em;
          }

          .evidencesHeroEyebrow {
            background: rgba(8, 145, 178, 0.14);
            color: #0f6b85;
          }

          .evidencesHeroTitle {
            margin: 14px 0 10px;
            font-size: clamp(1.6rem, 4vw, 2.3rem);
            line-height: 1.08;
          }

          .evidencesHeroText {
            margin: 0;
            max-width: 760px;
            color: var(--text-secondary);
            font-size: 0.98rem;
          }

          .evidencesSection {
            display: grid;
            gap: 16px;
          }

          .evidencesSectionHeader {
            display: grid;
            gap: 8px;
          }

          .evidencesSectionEyebrow {
            background: rgba(14, 116, 144, 0.1);
            color: var(--primary);
          }

          .evidencesSectionTitle {
            margin: 0;
            font-size: clamp(1.2rem, 3vw, 1.7rem);
            color: var(--text-primary);
          }

          .evidencesSectionText {
            margin: 0;
            max-width: 760px;
            color: var(--text-secondary);
          }

          .evidencesFlowWrap,
          .evidencesHistoryWrap {
            display: grid;
          }

          @media (max-width: 700px) {
            .evidencesHero {
              padding: 20px;
              border-radius: 20px;
            }

            .evidencesHeroTitle {
              font-size: 1.55rem;
            }

            .evidencesHeroText,
            .evidencesSectionText {
              font-size: 0.92rem;
            }
          }
        `}</style>
      </div>
    </RoleGuard>
  );
}
