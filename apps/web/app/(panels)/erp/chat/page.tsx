"use client";

import PageHeader from "@/components/ui/PageHeader";
import WorkspaceChat from "@/components/WorkspaceChat";
import { useUser } from "@/components/UserContext";

export default function ChatPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const userId = Number(user?.id ?? 0);

  return (
    <>
      <PageHeader
        eyebrow="Colaboración"
        title="Chat"
        subtitle="Canales, mensajes directos, hilos y salas por documento — en tiempo real."
      />
      {token && userId > 0 ? (
        <WorkspaceChat
          token={token}
          currentUserId={userId}
          currentUserName={user?.nombre ?? "Tú"}
        />
      ) : (
        <div style={{ padding: 24, color: "var(--text-secondary)", fontSize: 14 }}>
          Inicia sesión para usar el chat del equipo.
        </div>
      )}
    </>
  );
}
