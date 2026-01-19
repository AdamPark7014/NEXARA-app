"use client";
import localFont from "next/font/local";

import "./globals.css";
import "./utilities.css";
import Header from "../components/Header";
import { ThemeProvider } from "../components/ThemeContext";
import { UserProvider } from "../components/UserContext";
import Footer from "./components/Footer";
import { NotificationBanner } from "../components/NotificationBanner";

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
        <ThemeProvider>
          <UserProvider>
            <NotificationBanner />
            <Header />
            {children}
            <Footer />
          </UserProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
