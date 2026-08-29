import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ShopApp } from './ShopApp';
import '../src/styles/tokens.css';
import './shop.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ShopApp />
  </StrictMode>,
);
