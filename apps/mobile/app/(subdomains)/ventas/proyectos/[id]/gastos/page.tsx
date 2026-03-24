import ProjectExpensesPage from './ProjectExpensesClient';

export const dynamicParams = false;
export async function generateStaticParams() {
  // Project IDs are resolved at runtime via useParams(); no pre-rendered params are required.
  return [];
}

export default function Page() {
  return <ProjectExpensesPage />;
}
