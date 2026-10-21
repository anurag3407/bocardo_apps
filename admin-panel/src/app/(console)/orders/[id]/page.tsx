import { Suspense } from 'react';
import { OrderDetailView } from '@/features/orders/order-detail-view';

export default function Page({ params }: PageProps<'/orders/[id]'>) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <OrderDetail params={params} />
    </Suspense>
  );
}

async function OrderDetail({ params }: Pick<PageProps<'/orders/[id]'>, 'params'>) {
  const { id } = await params;
  return <OrderDetailView id={id} />;
}
