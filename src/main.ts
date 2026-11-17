import './style.css';
import { createEngine, renderGuidedWav } from './audio/engine';
import { mountEditor } from './editor';
import { mountShell } from './shell';

declare global {
  interface Window {
    renderDemoWav: () => Promise<string>;
  }
}

const engine = createEngine();
mountEditor(engine);
mountShell(engine);
document.documentElement.dataset.isolated = window.crossOriginIsolated ? '1' : '0';
document.documentElement.dataset.scope = engine.scope ? '1' : '0';

window.renderDemoWav = () => renderGuidedWav();

const RELOAD = 'chiptune-isolate';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const href = new URL('sw.js', document.baseURI).href;
    void navigator.serviceWorker.register(href, { scope: './' }).then(() => {
      if (window.crossOriginIsolated) {
        sessionStorage.removeItem(RELOAD);
        return;
      }
      const once = () => {
        if (sessionStorage.getItem(RELOAD) === '1') return;
        sessionStorage.setItem(RELOAD, '1');
        window.location.reload();
      };
      if (navigator.serviceWorker.controller) once();
      else navigator.serviceWorker.addEventListener('controllerchange', once);
    });
  });
}
