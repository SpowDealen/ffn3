import "./globals.css";
import Navbar from "../components/Navbar";

export const metadata = {
  title: "Full Fight News",
  description: "Noticias, eventos, resultados y disciplinas de deportes de combate",
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
          backgroundColor: "#0b0b0b",
          color: "white",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <Navbar />
        {children}
      </body>
    </html>
  );
}