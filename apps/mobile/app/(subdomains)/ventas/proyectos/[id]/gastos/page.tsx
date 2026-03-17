import ProjectExpensesPage from './ProjectExpensesClient';

export const dynamicParams = false;
export async function generateStaticParams() {
  // Return a placeholder so Next.js considers this route statically provided.
  // Actual [id] values are resolved at runtime via useParams() during in-app navigation.
  return [{ id: '__placeholder__' }];
}

export default function Page() {
  return <ProjectExpensesPage />;
}
