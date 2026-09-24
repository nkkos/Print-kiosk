import { useEffect, useState } from 'react';
import { listMyOrders, type AccountOrder } from '../../src/services/accountFileApi';

interface OrdersScreenProps {
  sessionToken: string;
}

const STATUS_LABEL: Record<AccountOrder['status'], string> = {
  created: 'Not billed yet',
  paid: 'Billed — awaiting print',
  issued: 'Printed',
};

// Every order for this account, any status — same data GET /api/accounts/orders
// already serves the personal portal (portal/OrdersPage.tsx), just a
// different screen shell. A company-billed order looks identical to a
// personally-paid one here since AccountOrder doesn't expose companyId —
// that's fine, this account only ever bills to its own company anyway.
export function OrdersScreen({ sessionToken }: OrdersScreenProps) {
  const [orders, setOrders] = useState<AccountOrder[] | null>(null);

  useEffect(() => {
    listMyOrders(sessionToken)
      .then(setOrders)
      .catch(() => {});
  }, [sessionToken]);

  return (
    <section className="view" id="view-orders">
      <div className="view-header">
        <div>
          <h1 className="view-title">Orders</h1>
        </div>
      </div>

      {!orders ? (
        <p className="empty-note">Loading…</p>
      ) : orders.length === 0 ? (
        <p className="empty-note">No orders yet.</p>
      ) : (
        <div className="incident-feed" id="business-orders-list">
          {orders.map((order) => (
            <div className="incident-row incident-row-static" key={order.id}>
              <span className="incident-code">{order.fileName}</span>
              <span className="incident-target">
                {order.paperSize} · {order.color === 'bw' ? 'B&W' : 'Color'} · ×{order.quantity}
              </span>
              <span className="incident-target">{STATUS_LABEL[order.status]}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
