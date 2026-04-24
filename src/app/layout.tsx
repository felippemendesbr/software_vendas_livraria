import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Software de Vendas - Livraria",
  description: "Sistema de vendas integrado com banco legado",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen antialiased overflow-x-hidden">{children}</body>
    </html>
  );
}
