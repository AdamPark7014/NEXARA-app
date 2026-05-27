"use client";

import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";

type Product = {
  sku: string;
  nombre: string;
  categoria: "Cámaras" | "DVR/NVR" | "Redes" | "Cómputo" | "Pantallas" | "Servicios" | "Mano de obra";
  marca: string;
  precio: number;
  stock: number;
  destacado: boolean;
};

const PRODUCTS: Product[] = [
  { sku: "HK-2143", nombre: "Cámara Hikvision DS-2CD2143G2-I 4MP", categoria: "Cámaras", marca: "Hikvision", precio: 3450, stock: 84, destacado: true },
  { sku: "HK-NVR16", nombre: "NVR Hikvision 16ch DS-7616NI-K2", categoria: "DVR/NVR", marca: "Hikvision", precio: 8900, stock: 12, destacado: true },
  { sku: "DAH-2230", nombre: "Cámara Dahua IPC-HFW2230S 2MP", categoria: "Cámaras", marca: "Dahua", precio: 2150, stock: 42, destacado: false },
  { sku: "UTP-CAT6", nombre: "Bobina UTP Cat6 305m", categoria: "Redes", marca: "Panduit", precio: 4200, stock: 28, destacado: true },
  { sku: "SW-24P", nombre: "Switch 24p PoE+ TP-Link TL-SG2428P", categoria: "Redes", marca: "TP-Link", precio: 6800, stock: 8, destacado: false },
  { sku: "LEN-T14", nombre: "Laptop Lenovo ThinkPad T14 i5/16GB/512SSD", categoria: "Cómputo", marca: "Lenovo", precio: 24500, stock: 15, destacado: true },
  { sku: "DLL-OPT", nombre: "Dell OptiPlex 3000 i5/8GB/256SSD", categoria: "Cómputo", marca: "Dell", precio: 17800, stock: 22, destacado: false },
  { sku: "PAN-55", nombre: 'Pantalla LG 55" 4K Commercial', categoria: "Pantallas", marca: "LG", precio: 18900, stock: 6, destacado: false },
  { sku: "SRV-INST-CCTV", nombre: "Instalación cámara CCTV (por unidad)", categoria: "Mano de obra", marca: "NEXARA", precio: 650, stock: 9999, destacado: false },
  { sku: "SRV-VST", nombre: "Visita técnica + diagnóstico", categoria: "Servicios", marca: "NEXARA", precio: 1200, stock: 9999, destacado: false },
];

export default function ProductsPage() {
  const columns: Column<Product>[] = [
    {
      key: "sku", label: "SKU",
      render: (p) => <code style={{ fontSize: 11.5, fontFamily: "var(--font-mono, ui-monospace, monospace)" }}>{p.sku}</code>,
      width: 130,
    },
    {
      key: "nombre", label: "Producto / Servicio",
      render: (p) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{p.nombre} {p.destacado && <span style={{ color: "var(--warning)" }}>★</span>}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{p.marca}</div>
        </div>
      ),
    },
    { key: "categoria", label: "Categoría", render: (p) => <Tag variant="neutral">{p.categoria}</Tag> },
    { key: "precio", label: "Precio", align: "right", render: (p) => <Money value={p.precio} /> },
    {
      key: "stock", label: "Stock", align: "center",
      render: (p) => {
        if (p.stock >= 9999) return <Tag variant="positive">∞</Tag>;
        if (p.stock < 10) return <Tag variant="danger">{p.stock}</Tag>;
        return <Tag variant="positive">{p.stock}</Tag>;
      },
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="CRM · Catálogo y clientes"
        title="Catálogo de productos y servicios"
        subtitle="Maestro de SKUs vinculado a almacén. Las cotizaciones se construyen desde este catálogo."
        actions={
          <>
            <Button variant="secondary" iconLeft="📥">
              Importar Excel
            </Button>
            <Button variant="primary" iconLeft="➕">
              Nuevo SKU
            </Button>
          </>
        }
      />
      <Section title={`${PRODUCTS.length} SKUs activos`} subtitle="★ = destacado en cotizaciones">
        <DataTable columns={columns} rows={PRODUCTS} rowKey={(p) => p.sku} onRowClick={(p) => alert(`Abrir ${p.sku}`)} />
      </Section>
    </>
  );
}
