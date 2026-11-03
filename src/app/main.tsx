import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../runtime/slide.css';
import '../runtime/player.css';
import './styles/app.css';
import { App } from './App';
import { PresenterView } from './components/PresenterView';
import { installBridge } from './lib/bridge';
import { installPresenterHost } from './lib/presenter';

const isPresenter = new URLSearchParams(window.location.search).has('presenter');
if (!isPresenter) {
  installBridge();
  installPresenterHost();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isPresenter ? <PresenterView /> : <App />}</StrictMode>,
);
