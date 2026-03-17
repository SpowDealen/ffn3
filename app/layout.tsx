import type {Metadata} from "next";
import "./globals.css";
import Navbar from "../components/Navbar";

export const metadata: Metadata = {
  title: "Full Fight News",
  description:
    "Noticias, eventos, resultados, luchadores, disciplinas y categorías de peso del mundo de los deportes de combate.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          background:
            "radial-gradient(circle at top, #151826 0%, #0b0b0b 35%, #070707 100%)",
          color: "white",
          fontFamily: "Arial, Helvetica, sans-serif",
          minHeight: "100vh",
        }}
      >
        <Navbar />
        {children}
      </body>
    </html>
  );
}