import { redirect } from 'next/navigation';

export default async function MarketingPage({ searchParams }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries((await searchParams) || {})) {
    for (const item of [].concat(value)) if (typeof item === 'string') params.append(key, item);
  }
  const query = params.toString();
  redirect(`/studio/marketing${query ? `?${query}` : ''}`);
}
