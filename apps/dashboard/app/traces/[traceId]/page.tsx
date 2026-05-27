import { getTrace } from '@/lib/api';

interface Props {
    params: Promise<{ traceId: string }>;
}

export default async function TracePage({ params }: Props) {
    const { traceId } = await params;
    const tree = await getTrace(traceId);

    return (
        <main className="p-8">
            <h1 className="text-2xl font-semibold mb-6">Trace Detail</h1>
            <pre className="text-xs bg-muted p-4 rounded overflow-auto">
        {JSON.stringify(tree, null, 2)}
      </pre>
        </main>
    );
}