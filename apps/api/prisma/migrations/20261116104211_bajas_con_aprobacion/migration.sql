-- Bajas con aprobación (RH solicita; dirección aprueba o RH aplica con VoBo).
CREATE TYPE "MotivoBaja" AS ENUM ('RENUNCIA', 'ABANDONO', 'DESPIDO', 'FIN_CONTRATO', 'OTRO');
CREATE TYPE "ModoBaja" AS ENUM ('SOLICITUD', 'APLICADA_CON_VOBO');
CREATE TYPE "EstadoBaja" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'REVERTIDA');

CREATE TABLE "user_deactivation_requests" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "solicitadoPorId" INTEGER NOT NULL,
  "motivo" "MotivoBaja" NOT NULL,
  "fechaBaja" DATE NOT NULL,
  "comentario" TEXT,
  "modo" "ModoBaja" NOT NULL,
  "justificacion" TEXT,
  "estado" "EstadoBaja" NOT NULL DEFAULT 'PENDIENTE',
  "decididoPorId" INTEGER,
  "decididoAt" TIMESTAMP(3),
  "motivoRechazo" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_deactivation_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "user_deactivation_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "user_deactivation_requests_solicitadoPorId_fkey" FOREIGN KEY ("solicitadoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "user_deactivation_requests_decididoPorId_fkey" FOREIGN KEY ("decididoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "user_deactivation_requests_companyId_estado_idx" ON "user_deactivation_requests"("companyId", "estado");
CREATE INDEX "user_deactivation_requests_userId_estado_idx" ON "user_deactivation_requests"("userId", "estado");
