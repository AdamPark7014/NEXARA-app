"use client";

import { useRouter } from "next/navigation";
import OpsActivityForm from "@/components/ops/OpsActivityForm";
import { useActivityDetail } from "@/components/ops/ActivityDetailShell";

export default function EditActivityPage() {
  const router = useRouter();
  const { id } = useActivityDetail();

  return (
    <OpsActivityForm
      activityId={id}
      onCancel={() => router.push(`/ops/activities/${id}`)}
      onSuccess={() => router.push(`/ops/activities/${id}`)}
    />
  );
}
