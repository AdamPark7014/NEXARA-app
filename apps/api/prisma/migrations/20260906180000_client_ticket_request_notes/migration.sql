-- Notas internas en solicitudes de soporte (PATCH client-ticket-requests/:id)
ALTER TABLE "client_ticket_requests" ADD COLUMN IF NOT EXISTS "notes" TEXT;
