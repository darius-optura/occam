// cursor.js — proof init script. Injected at browser launch, replays into every document.
// Draws a pointer that follows CDP mouse events (headless/CDP captures show no OS cursor),
// pulses on mousedown, and exposes window.__proofChapter(title, ms) for chapter cards.
(() => {
  if (window.__proofOverlay) return;
  window.__proofOverlay = true;
  const Z = 2147483647;
  const dot = document.createElement('div');
  dot.style.cssText = `position:fixed;left:0;top:0;width:18px;height:18px;border-radius:50%;
    background:rgba(255,80,0,.85);border:2px solid #fff;box-shadow:0 0 6px rgba(0,0,0,.5);
    pointer-events:none;z-index:${Z};transform:translate(-9px,-9px);transition:transform .06s`;
  const mount = () => document.documentElement.appendChild(dot);
  document.readyState === 'loading' ? addEventListener('DOMContentLoaded', mount) : mount();
  addEventListener('mousemove', e => { dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px'; }, true);
  addEventListener('mousedown', () => { dot.style.transform = 'translate(-9px,-9px) scale(1.7)'; }, true);
  addEventListener('mouseup', () => { dot.style.transform = 'translate(-9px,-9px)'; }, true);

  window.__proofChapter = (title, ms = 1200) => {
    const card = document.createElement('div');
    card.style.cssText = `position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
      background:rgba(20,20,20,.55);backdrop-filter:blur(6px);z-index:${Z - 1};pointer-events:none;
      font:600 44px/1.2 -apple-system,system-ui,sans-serif;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.6)`;
    card.textContent = title;
    document.documentElement.appendChild(card);
    setTimeout(() => card.remove(), ms);
    return 'chapter:' + title;
  };
})();
