import BranchTicketsPage from './BranchTicketsClient';

export const dynamicParams = false;
export async function generateStaticParams() {
  // Branch values are resolved at runtime via useParams(); no pre-rendered params are required.
  return [];
}

export default function Page() {
  return <BranchTicketsPage />;
}
