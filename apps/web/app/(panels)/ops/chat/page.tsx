"use client";

import WorkspaceChat from "@/components/WorkspaceChat";
import { useUser } from "@/components/UserContext";

export default function OpsChatPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const userId = Number(user?.id ?? 0);

  if (!token || userId <= 0) {
    return (
      <div style={{ padding: 24, color: "var(--text-secondary)", fontSize: 14 }}>
        Inicia sesión para usar el chat.
      </div>
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
