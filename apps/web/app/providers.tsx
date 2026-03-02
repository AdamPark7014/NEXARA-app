"use client";

import { ThemeProvider } from "../components/ThemeContext";
import { UserProvider } from "../components/UserContext";
import LoginWelcomeBanner from "../components/LoginWelcomeBanner";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <ThemeProvider>
        <LoginWelcomeBanner />
        {children}
      </ThemeProvider>
    </UserProvider>
  );
}
