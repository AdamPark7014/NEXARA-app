import OpsProjectDetailShell from "@/components/ops/OpsProjectDetailShell";

export default async function OpsProjectDetailLayout(props: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return <OpsProjectDetailShell id={id}>{props.children}</OpsProjectDetailShell>;
}
