(() => {
  'use strict';
  const toggle = document.getElementById('mobileMenuToggle');
  const backdrop = document.getElementById('mobileNavBackdrop');
  const side = document.querySelector('.side');
  if (!toggle || !backdrop || !side) return;

  const mobile = window.matchMedia('(max-width: 760px)');
  const setOpen = (open) => {
    const shouldOpen = Boolean(open && mobile.matches);
    document.body.classList.toggle('mobile-menu-open', shouldOpen);
    toggle.setAttribute('aria-expanded', String(shouldOpen));
    toggle.setAttribute('aria-label', shouldOpen ? 'Fechar menu' : 'Abrir menu');
    toggle.textContent = shouldOpen ? '×' : '☰';
    backdrop.hidden = !shouldOpen;
    side.setAttribute('aria-hidden', String(mobile.matches && !shouldOpen));
  };

  toggle.addEventListener('click', () => setOpen(!document.body.classList.contains('mobile-menu-open')));
  backdrop.addEventListener('click', () => setOpen(false));
  side.querySelectorAll('button[data-view], button[data-goto], #importSide, #exportSide, #templateSide, #clearDataSide').forEach((button) => {
    button.addEventListener('click', () => setOpen(false));
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setOpen(false);
  });
  const onViewportChange = () => setOpen(false);
  if (mobile.addEventListener) mobile.addEventListener('change', onViewportChange);
  else mobile.addListener(onViewportChange);
  setOpen(false);
})();
