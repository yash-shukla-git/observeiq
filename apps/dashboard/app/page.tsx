import { getTraces } from '@/lib/api';
import TraceTable from '../components/TraceTable';

export default async function Home() {
  const traces = await getTraces();

  return (
      <main className="p-8">
        <h1 className="text-2xl font-semibold mb-6">Traces</h1>
        <TraceTable initialTraces={traces} />
      </main>
  );
}