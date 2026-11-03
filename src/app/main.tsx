import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../runtime/slide.css';
import '../runtime/player.css';
import './styles/app.css';
import { App } from './App';
import { installBridge } from './lib/bridge';

installBridge();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
