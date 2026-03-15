import "./globals.scss";
import "./utilities.scss";
import "./ecosystem.scss";
import "./mobile-small.scss";
import ClientLayout from "./ClientLayout";
import Providers from "./providers";


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers>
          <ClientLayout>
            {children}
          </ClientLayout>
        </Providers>
      </body>
    </html>
  );
}
