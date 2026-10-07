import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ShopApp } from './ShopApp';
import '../src/styles/tokens.css';
import './shop.css';
import { showEnvironmentBanner } from '../src/utils/environmentBanner';

showEnvironmentBanner();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ShopApp />
  </StrictMode>,
);
