"use client";

import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import { Tag } from "@/components/ui/DataTable";

const TREE = [
  {
    role: "CEO / Developer",
    name: "Adrián Pozos",
    children: [
      {
        role: "Directora Comercial",
        name: "Karen Estrada",
        children: [
          { role: "Sales Manager", name: "(vacante)", children: [
            { role: "Ejecutiva Senior", name: "Karina Méndez" },
          ] },
          { role: "Diseñadora", name: "Vania Salgado" },
        ],
      },
      {
        role: "Director de Operaciones",
        name: "(rotativo)",
        children: [
          { role: "Project Manager", name: "Ronaldo H." },
          { role: "Ingeniero Senior", name: "Brandon C." },
          { role: "Ingenieros de Campo", name: "Sandra L., Eduardo M." },
          { role: "Soporte / NOC", name: "Luis Aguilar" },
        ],
      },
      {
        role: "Director Administrativo",
        name: "(función dual con CEO)",
        children: [
          { role: "Contadora", name: "Karla Ruiz" },
          { role: "Admin Staff / RH", name: "(perfil compartido)" },
        ],
      },
    ],
  },
] as const;

function Node({ node, depth = 0 }: { node: any; depth?: number }) {
  return (
    <div style={{ paddingLeft: depth === 0 ? 0 : 20, position: "relative" }}>
      <div
        style={{
          padding: "10px 14px",
          background: depth === 0 ? "color-mix(in srgb, var(--primary) 10%, transparent)" : "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          display: "inline-flex",
          flexDirection: "column",
          gap: 4,
          marginBottom: 8,
          minWidth: 240,
        }}
      >
        <Tag variant={depth === 0 ? "accent" : "neutral"}>{node.role}</Tag>
        <span style={{ fontWeight: 700, fontSize: 13 }}>{node.name}</span>
      </div>
      {node.children && (
        <div
          style={{
            marginLeft: 14,
            borderLeft: "2px dashed var(--border)",
            paddingLeft: 14,
            marginTop: 4,
          }}
        >
          {node.children.map((c: any, i: number) => (
            <Node key={i} node={c} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function OrgChartPage() {
  return (
    <>
      <PageHeader
        eyebrow="ERP · Personas"
        title="Organigrama"
        subtitle="Jerarquía actual de NEXARA. Para ver permisos por rol, ve a Usuarios."
      />
      <Section title="Estructura corporativa">
        {TREE.map((root, i) => <Node key={i} node={root} />)}
        <div style={{ marginTop: 16, padding: 12, background: "color-mix(in srgb, var(--surface-2) 60%, transparent)", borderRadius: 10, fontSize: 12.5, color: "var(--text-secondary)" }}>
          ¿Quieres ver qué URL puede tocar cada rol?{" "}
          <Link href="/erp/users" style={{ color: "var(--primary)", fontWeight: 600 }}>
            Abre Usuarios y roles →
          </Link>
        </div>
      </Section>
    </>
  );
}
