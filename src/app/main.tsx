import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../runtime/slide.css';
import '../runtime/player.css';
import './styles/app.css';
import { App } from './App';
import { PresenterView } from './components/PresenterView';
import { ViewerPage } from './components/ViewerPage';
import { installBridge } from './lib/bridge';
import { installPresenterHost } from './lib/presenter';

const params = new URLSearchParams(window.location.search);
const isPresenter = params.has('presenter');
const viewId = params.get('view');
if (!isPresenter && !viewId) {
  installBridge();
  installPresenterHost();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>{viewId ? <ViewerPage id={viewId} /> : isPresenter ? <PresenterView /> : <App />}</StrictMode>,
);
