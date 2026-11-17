import './style.css';
import { createEngine, renderPatternWav } from './audio/engine';
import { mountEditor } from './editor';

declare global {
  interface Window {
    renderDemoWav: () => Promise<string>;
  }
}

const engine = createEngine();
mountEditor(engine);

window.renderDemoWav = () => renderPatternWav(engine.pattern, engine.bpm);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(new URL('sw.js', document.baseURI).href);
  });
}
