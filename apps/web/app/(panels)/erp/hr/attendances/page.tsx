import { redirect } from "next/navigation";

/** Typo de remap viejo: /erp/hr/attendances → Asistencias Core */
export default function ErpHrAttendancesTypoRedirect() {
  redirect("/erp/asistencias");
}