-- CreateTable
CREATE TABLE "UserProfile" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "telefono" VARCHAR(30),
    "fechaNacimiento" TIMESTAMP(3),
    "direccion" TEXT,
    "colonia" TEXT,
    "ciudad" TEXT,
    "estado" TEXT,
    "codigoPostal" VARCHAR(10),
    "pais" VARCHAR(50),
    "curp" VARCHAR(30),
    "rfc" VARCHAR(20),
    "ineNumero" VARCHAR(30),
    "nss" VARCHAR(30),
    "contactoEmergenciaNombre" TEXT,
    "contactoEmergenciaTelefono" VARCHAR(30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserDocument" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "tipo" VARCHAR(50) NOT NULL,
    "archivoUrl" TEXT NOT NULL,
    "estatus" VARCHAR(30) NOT NULL DEFAULT 'Pendiente',
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDocument" ADD CONSTRAINT "UserDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
