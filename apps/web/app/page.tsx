import { redirect } from 'next/navigation';

export default function Home() {
  // Enrichment is the primary product surface, not a generic dashboard.
  redirect('/upload');
}
