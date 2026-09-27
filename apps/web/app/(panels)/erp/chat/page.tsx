"use client";

import { useRouter } from "next/navigation";
import WorkspaceChat from "@/components/WorkspaceChat";
import { useUser } from "@/components/UserContext";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";

export default function ChatPage() {
  const router = useRouter();
  const { user } = useUser();
  const token = user?.token ?? "";
  const userId = Number(user?.id ?? 0);

  if (!token || userId <= 0) {
    return (
      <EmptyState
        variant="page"
        icon="💬"
        title="Chat del equipo"
        description="Tu sesión no está activa. Vuelve a iniciar sesión para conversar con tu equipo."
        action={<Button variant="primary" onClick={() => router.replace("/login")}>Iniciar sesión</Button>}
      />
    );
  }

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "none",
        height: "100%",
        minHeight: 0,
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignSelf: "stretch",
      }}
    >
      <WorkspaceChat
        token={token}
        currentUserId={userId}
        currentUserName={user?.nombre ?? "Tú"}
      />
    </div>
  );
}
