import { useParams } from 'react-router-dom';

export default function ItemDetailPage() {
  const { id } = useParams();
  return <div className="p-10 text-center opacity-60">Item detail for #{id} — coming in step 5.</div>;
}
