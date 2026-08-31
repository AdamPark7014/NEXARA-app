import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "NEXARA — CCTV, redes y soporte TI en México";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 72,
          background: "linear-gradient(135deg, #0b1220 0%, #0f6ad6 55%, #1a9fff 100%)",
          color: "#ffffff",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 600, opacity: 0.9, letterSpacing: 4, textTransform: "uppercase" }}>
          NEXARA
        </div>
        <div style={{ marginTop: 24, fontSize: 56, fontWeight: 700, lineHeight: 1.1, maxWidth: 900 }}>
          CCTV, redes y soporte TI en México
        </div>
        <div style={{ marginTop: 28, fontSize: 28, opacity: 0.92, maxWidth: 820, lineHeight: 1.4 }}>
          Una sola firma: diseño, instalación y operación. Puebla · CDMX · cobertura nacional.
        </div>
      </div>
    ),
    { ...size },
  );
}
