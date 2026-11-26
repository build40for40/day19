// A small perspective shift gives the clay and paper layers physical depth.
// Touch devices and reduced-motion visitors get the same composition, at rest.
const art = document.querySelector('.hero-art');
const scene = document.querySelector('.art-scene');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');

if (art && scene) {
  const reset = () => {
    scene.style.removeProperty('--tilt-x');
    scene.style.removeProperty('--tilt-y');
  };
  art.addEventListener('pointermove', (event) => {
    if (reducedMotion.matches || !finePointer.matches) return;
    const bounds = art.getBoundingClientRect();
    const x = Math.max(-.5, Math.min(.5, (event.clientX - bounds.left) / bounds.width - .5));
    const y = Math.max(-.5, Math.min(.5, (event.clientY - bounds.top) / bounds.height - .5));
    scene.style.setProperty('--tilt-x', `${-y * 8}deg`);
    scene.style.setProperty('--tilt-y', `${x * 10}deg`);
  });
  art.addEventListener('pointerleave', reset);
  reducedMotion.addEventListener('change', reset);
  finePointer.addEventListener('change', reset);
}
