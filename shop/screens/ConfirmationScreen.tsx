import type { CheckoutResult } from '../services/shopApi';

interface ConfirmationScreenProps {
  result: CheckoutResult;
  onGoToOrders: () => void;
  onGoToCatalog: () => void;
}

// Shows every resulting order from the purchase together on one screen
// (docs/shop-checkout-requirements.md's "Confirmation screen"), even though they're
// independent records afterward in order history.
export function ConfirmationScreen({
  result,
  onGoToOrders,
  onGoToCatalog,
}: ConfirmationScreenProps) {
  return (
    <section className="shop-view" id="view-confirmation">
      <div className="shop-confirmation">
        <h1>Спасибо за заказ!</h1>
        <p>Оплата прошла успешно.</p>

        {result.printOrderIds.length > 0 && (
          <div className="shop-confirmation-order" id="confirmation-print-orders">
            <b>Печать — готова к выдаче на киоске:</b>
            <ul>
              {result.printOrderIds.map((id) => (
                <li key={id}>Заказ №{id.slice(0, 8)}</li>
              ))}
            </ul>
          </div>
        )}

        {result.shopOrderId && (
          <div className="shop-confirmation-order" id="confirmation-shop-order">
            <b>Магазин — мы готовим ваш заказ:</b>
            <p>Заказ №{result.shopOrderId.slice(0, 8)} — заберёте в павильоне, как будет готово.</p>
          </div>
        )}

        <div className="shop-hero-actions">
          <button type="button" className="shop-btn shop-btn-primary" onClick={onGoToOrders}>
            Мои заказы
          </button>
          <button type="button" className="shop-btn shop-btn-ghost" onClick={onGoToCatalog}>
            В каталог
          </button>
        </div>
      </div>
    </section>
  );
}
