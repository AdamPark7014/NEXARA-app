import BranchTicketsPage from './BranchTicketsClient';

export const dynamicParams = false;
export async function generateStaticParams() {
  // Return a placeholder so Next.js considers this route statically provided.
  // Actual [branch] values are resolved at runtime via useParams() during in-app navigation.
  return [{ branch: '__placeholder__' }];
}

export default function Page() {
  return <BranchTicketsPage />;
}
