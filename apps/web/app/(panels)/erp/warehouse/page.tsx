"use client";

import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import KpiCard from "@/components/ui/KpiCard";
import Button from "@/components/ui/Button";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";

type Stock = {
  sku: string;
  nombre: string;
  categoria: string;
  ubicacion: string;
  existencia: number;
  minimo: number;
  costo: number;
  estado: "OK" | "Bajo mínimo" | "Sin stock";
};

const STOCK: Stock[] = [
  { sku: "HK-2143", nombre: "Cámara Hikvision DS-2CD2143G2-I 4MP", categoria: "Cámaras", ubicacion: "CEDIS Puebla · A1-03", existencia: 84, minimo: 30, costo: 2150, estado: "OK" },
  { sku: "HK-NVR16", nombre: "NVR Hikvision 16ch", categoria: "DVR/NVR", ubicacion: "CEDIS Puebla · A2-01", existencia: 12, minimo: 8, costo: 5400, estado: "OK" },
  { sku: "DAH-2230", nombre: "Cámara Dahua IPC-HFW2230S", categoria: "Cámaras", ubicacion: "CEDIS Puebla · A1-04", existencia: 42, minimo: 20, costo: 1380, estado: "OK" },
  { sku: "UTP-CAT6", nombre: "Bobina UTP Cat6 305m", categoria: "Redes", ubicacion: "CEDIS Puebla · B1-02", existencia: 28, minimo: 15, costo: 2800, estado: "OK" },
  { sku: "SW-24P", nombre: "Switch 24p PoE+ TP-Link", categoria: "Redes", ubicacion: "CEDIS Puebla · B2-01", existencia: 8, minimo: 10, costo: 4200, estado: "Bajo mínimo" },
  { sku: "LEN-T14", nombre: "Laptop Lenovo ThinkPad T14", categoria: "Cómputo", ubicacion: "CEDIS Puebla · C1-01", existencia: 15, minimo: 5, costo: 18200, estado: "OK" },
  { sku: "DLL-OPT", nombre: "Dell OptiPlex 3000 i5", categoria: "Cómputo", ubicacion: "CEDIS Puebla · C1-02", existencia: 22, minimo: 8, costo: 13500, estado: "OK" },
  { sku: "PAN-55", nombre: "Pantalla LG 55\" 4K Commercial", categoria: "Pantallas", ubicacion: "CEDIS Puebla · D1-01", existencia: 6, minimo: 4, costo: 14500, estado: "OK" },
  { sku: "CON-RJ45", nombre: "Conectores RJ45 Cat6 (bolsa 100)", categoria: "Consumibles", ubicacion: "CEDIS Puebla · E1-01", existencia: 0, minimo: 5, costo: 280, estado: "Sin stock" },
];

export default function WarehousePage() {
  const valorInventario = STOCK.reduce((s, p) => s + p.existencia * p.costo, 0);
  const bajoMinimo = STOCK.filter((p) => p.estado === "Bajo mínimo").length;
  const sinStock = STOCK.filter((p) => p.estado === "Sin stock").length;

  const columns: Column<Stock>[] = [
    { key: "sku", label: "SKU", render: (s) => <code style={{ fontSize: 11.5 }}>{s.sku}</code>, width: 130 },
    {
      key: "nombre", label: "Producto",
      render: (s) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{s.nombre}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{s.categoria} · {s.ubicacion}</div>
        </div>
      ),
    },
    {
      key: "existencia", label: "Existencia", align: "center",
      render: (s) => (
        <Tag variant={s.estado === "OK" ? "positive" : s.estado === "Bajo mínimo" ? "warning" : "danger"}>
          {s.existencia} / min {s.minimo}
        </Tag>
      ),
    },
    { key: "costo", label: "Costo u.", align: "right", render: (s) => <Money value={s.costo} compact /> },
    { key: "valor", label: "Valor stock", align: "right", render: (s) => <Money value={s.existencia * s.costo} compact /> },
  ];

  return (
    <>
      <PageHeader
        eyebrow="ERP · Logística"
        title="Almacén"
        subtitle="Inventario CEDIS Puebla. Stock, mínimos y movimientos de almacén."
        actions={
          <>
            <Button variant="secondary" iconLeft="📋">Movimientos</Button>
            <Button variant="primary" iconLeft="📦">Entrada / Salida</Button>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 18 }}>
        <KpiCard label="Valor en inventario" value={<Money value={valorInventario} />} hint={`${STOCK.length} SKUs activos`} variant="positive" icon="📦" />
        <KpiCard label="Bajo mínimo" value={bajoMinimo} hint="Requiere compra" variant="warning" icon="⚠️" />
        <KpiCard label="Sin stock" value={sinStock} hint="Quiebre de inventario" variant="danger" icon="❌" />
        <KpiCard label="Salidas de hoy" value="14" hint="Asignadas a OT" variant="default" icon="📤" />
      </div>

      <Section title="Inventario actual">
        <DataTable columns={columns} rows={STOCK} rowKey={(s) => s.sku} onRowClick={(s) => alert(`Abrir ${s.sku}`)} />
      </Section>
    </>
  );
}
