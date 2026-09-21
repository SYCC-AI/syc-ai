// Every account carries its own theme. A theme is a palette that becomes CSS
// variables one to one, plus optional photographs that dissolve into one
// another every 30 seconds. The same identity follows the user through every
// panel section so navigation never feels like jumping between applications.
let themeRotation = null;
let themeVars = [];
let themeSignature = '';

// Two stacked layers hold the photographs so one fades into the next instead of
// snapping; the visible one keeps drifting until it is handed over.
function themeBackdrop() {
  let backdrop = document.querySelector('.theme-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.className = 'theme-backdrop';
    backdrop.innerHTML = '<div class="theme-layer visible"></div><div class="theme-layer"></div>';
    document.body.prepend(backdrop);
  }
  return backdrop.querySelectorAll('.theme-layer');
}

// A photograph is up to half a megabyte, and the browser only starts fetching
// it when the layer that needs it is already fading in — which is exactly when
// the picture is missing. Pulling the next one into the cache one turn early
// makes the crossfade land on a decoded image.
const themePrefetched = new Set();
function prefetchBackground(value) {
  const src = /url\(["']?([^"')]+)["']?\)/.exec(String(value || ''))?.[1];
  if (!src || themePrefetched.has(src)) return;
  themePrefetched.add(src);
  const image = new Image();
  image.decoding = 'async';
  image.src = src;
}

function applyTheme(theme) {
  const value = theme?.definition || theme;
  if (!value?.id && !theme?.id) return;
  const id = theme?.id || value.id;
  // Native controls (select menus, scrollbars and form affordances) otherwise
  // keep the browser's dark rendering even when the assigned palette is light.
  document.documentElement.style.colorScheme = id === 'light' ? 'light' : 'dark';
  // Re-applying the theme a page already wears would restart the rotation and
  // snap back to the first photograph — which is what every manual refresh of
  // the users panel used to do.
  const signature = JSON.stringify({
    id,
    font: value.font || 'Vazirmatn',
    colors: value.colors || {},
    backgrounds: value.backgrounds || [],
  });
  if (signature === themeSignature && document.querySelector('.theme-layer')) return;
  clearInterval(themeRotation);
  themeSignature = signature;
  document.body.dataset.theme = id;
  document.documentElement.style.setProperty('--theme-font', value.font || 'Vazirmatn');
  themeVars.forEach((name) => document.documentElement.style.removeProperty(name));
  const palette = value.colors && !Array.isArray(value.colors) ? value.colors : {};
  themeVars = Object.entries(palette).map(([name, color]) => {
    document.documentElement.style.setProperty(`--${name}`, color);
    return `--${name}`;
  });

  const backgrounds = value.backgrounds?.length ? value.backgrounds : [palette.bg || '#080c16'];
  const layers = themeBackdrop();
  let index = 0;
  let front = 0;
  const paint = () => {
    const picture = backgrounds[index % backgrounds.length];
    document.documentElement.style.setProperty('--theme-background', picture);
    if (index === 0) {
      layers[0].style.background = picture;
    } else {
      const next = 1 - front;
      layers[next].style.background = picture;
      layers[next].classList.add('visible');
      layers[front].classList.remove('visible');
      front = next;
    }
    // Restart the slow zoom on whichever layer just came forward.
    layers[front].style.animation = 'none';
    void layers[front].offsetWidth;
    layers[front].style.animation = '';
    index += 1;
    prefetchBackground(backgrounds[index % backgrounds.length]);
  };
  paint();
  // Someone who asked the system for less movement gets the first photograph
  // and no rotation at all, rather than a picture that keeps changing under a
  // stylesheet that has already turned the animations off.
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  themeRotation = setInterval(paint, 30000);
}

window.applyTheme = applyTheme;
