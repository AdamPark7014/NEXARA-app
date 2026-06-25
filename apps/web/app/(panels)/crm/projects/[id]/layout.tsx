import ProjectDetailShell from "@/components/crm/ProjectDetailShell";

export default async function CrmProjectDetailLayout(props: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return <ProjectDetailShell id={id}>{props.children}</ProjectDetailShell>;
}
