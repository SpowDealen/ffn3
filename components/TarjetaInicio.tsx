import Link from "next/link";

type TarjetaInicioProps = {
  href: string;
  titulo: string;
  descripcion: string;
};

export default function TarjetaInicio({
  href,
  titulo,
  descripcion,
}: TarjetaInicioProps) {
  return (
    <Link
      href={href}
      style={{
        backgroundColor: "#111",
        padding: "20px",
        border: "1px solid #222",
        borderRadius: "12px",
        textDecoration: "none",
        color: "white",
        display: "block",
        transition: "all 0.2s ease",
      }}
    >
      <h3 style={{ marginBottom: "8px" }}>{titulo}</h3>

      <p style={{ color: "#aaa" }}>{descripcion}</p>
    </Link>
  );
}