import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { OrdersPage } from './OrdersPage';
import './portal.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OrdersPage />
  </StrictMode>,
);
