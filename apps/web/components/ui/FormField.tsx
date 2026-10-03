"use client";

import type { ReactNode } from "react";
import { Field, FieldGrid } from "@/components/base/campos";

/**
 * Campo de formulario compartido (envoltorio de `components/base/campos` Field) —
 * mismo contrato que Finanzas (`.ai/DISENO-FINANZAS.md` regla 5): hint bajo el
 * control, opcional en la etiqueta, error que reemplaza al hint.
 *
 * Si el hijo es un solo control, se le conectan `aria-describedby` (pista o
 * error) y `aria-invalid` para que el lector de pantalla lea el porqué.
 */

export function FormGrid({ children, columns }: { children: ReactNode; columns?: 1 | 2 | 3 }) {
  return <FieldGrid columns={columns}>{children}</FieldGrid>;
}

export function FormField({
  label,
  children,
  fullWidth,
  hint,
  optional,
  error,
  describedById,
  required,
}: {
  label: string;
  children: ReactNode;
  fullWidth?: boolean;
  hint?: ReactNode;
  optional?: boolean;
  error?: string | null;
  describedById?: string;
  /** Marca visual «obligatorio» (asterisco) y `aria-required` en el control. */
  required?: boolean;
}) {
  return (
    <Field
      label={label}
      fullWidth={fullWidth}
      hint={hint}
      optional={optional}
      error={error}
      describedById={describedById}
      required={required}
    >
      {children}
    </Field>
  );
}
