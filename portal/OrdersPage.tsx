import { useEffect, useState } from 'react';
import { usePortalSession } from './useSession';
import { PortalShell } from './PortalShell';
import { LoginForm } from './LoginForm';
import { listMyOrders, payOrder, type AccountOrder } from '../src/services/accountFileApi';

// The portal's full order history — all three lifecycle states
// (docs/personal-account-requirements.md, "Order status lifecycle";
// docs/screens/portal-personal-account-spec.md, "My orders"). Unlike the
// kiosk's own My orders (scoped to "paid, awaiting print" only), this is
// the one surface with both a "pay" action (created -> paid) and history
// (issued).
const STATUS_LABEL: Record<AccountOrder['status'], string> = {
  created: 'Awaiting payment',
  paid: 'Paid — awaiting fulfillment',
  issued: 'Issued',
};

export function OrdersPage() {
  const { session, login, logout } = usePortalSession();
  const [orders, setOrders] = useState<AccountOrder[]>([]);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh(sessionToken: string) {
    setOrders(await listMyOrders(sessionToken));
  }

  useEffect(() => {
    if (session) refresh(session.sessionToken);
  }, [session]);

  async function handlePay(orderId: string) {
    if (!session) return;
    setPayingId(orderId);
    setError(null);
    try {
      await payOrder(session.sessionToken, orderId);
      await refresh(session.sessionToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed');
    } finally {
      setPayingId(null);
    }
  }

  if (!session) {
    return (
      <LoginForm
        onLogin={async (email, password) => {
          await login(email, password);
          window.location.href = './start.html';
        }}
      />
    );
  }

  return (
    <PortalShell email={session.email} active="orders" onLogout={logout}>
      <h1>My orders</h1>
      {error && <p className="error">{error}</p>}
      {orders.length === 0 ? (
        <p>No orders yet.</p>
      ) : (
        <ul className="plainList">
          {orders.map((order) => (
            <li key={order.id}>
              <div>
                <strong>{order.fileName}</strong> — Qty {order.quantity} —{' '}
                {STATUS_LABEL[order.status]}
              </div>
              {order.status === 'created' && (
                <button
                  type="button"
                  onClick={() => handlePay(order.id)}
                  disabled={payingId === order.id}
                >
                  Pay now (simulated)
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </PortalShell>
  );
}
