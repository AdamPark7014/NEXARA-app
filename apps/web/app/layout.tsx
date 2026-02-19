"use client";
// Habilita el contexto de React en todo el layout
import localFont from "next/font/local";

import "./globals.css";
import "./utilities.css";
import Header from "../components/Header";
import { ThemeProvider } from "../components/ThemeContext";
import ClientLayout from "./ClientLayout";
import Footer from "./components/Footer";
import { NotificationBanner } from "../components/NotificationBanner";
import { UserProvider } from "../components/UserContext";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <UserProvider>
          <ThemeProvider>
            <ClientLayout>
              <NotificationBanner />
              <Header />
              {children}
              <Footer />
            </ClientLayout>
          </ThemeProvider>
        </UserProvider>
      </body>
    </html>
  );
}
