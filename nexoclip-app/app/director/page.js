import { redirect } from 'next/navigation';

// The Director lives inside the studio shell; keep /director as a short link.
export default function DirectorPage() {
  redirect('/studio/director');
}
