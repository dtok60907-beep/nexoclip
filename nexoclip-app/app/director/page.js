import { redirect } from 'next/navigation';

// The Director lives inside the studio shell; keep /director as a short link. The query
// (e.g. ?prompt= from the landing page) goes along.
export default async function DirectorPage({ searchParams }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries((await searchParams) || {})) {
    for (const item of [].concat(value)) if (typeof item === 'string') params.append(key, item);
  }
  const query = params.toString();
  redirect(`/studio/director${query ? `?${query}` : ''}`);
}
