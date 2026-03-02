"use client";

import { ThemeProvider } from "../components/ThemeContext";
import { UserProvider } from "../components/UserContext";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <ThemeProvider>{children}</ThemeProvider>
    </UserProvider>
  );
}
