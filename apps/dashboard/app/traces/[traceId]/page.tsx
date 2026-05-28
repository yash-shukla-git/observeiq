import { getTrace } from '@/lib/api';
import WaterfallChart from "@/app/components/WaterfallChart";

interface Props {
    params: Promise<{ traceId: string }>;
}

export default async function TracePage({ params }: Props) {
    const { traceId } = await params;
    const tree = await getTrace(traceId);

    return (
        <main className="p-8">
            <h1 className="text-2xl font-semibold mb-6">Trace Detail</h1>
            <WaterfallChart tree={tree} />
        </main>
    );
}