(() => {
  const sidebar = document.getElementById('appSidebar');
  const toggle = document.getElementById('mobileMenuToggle');
  const close = document.getElementById('mobileMenuClose');
  const backdrop = document.getElementById('mobileMenuBackdrop');
  if (!sidebar || !toggle || !close || !backdrop) return;

  const mobileQuery = window.matchMedia('(max-width: 760px)');
  const setOpen = (open) => {
    const isOpen = Boolean(open && mobileQuery.matches);
    document.body.classList.toggle('mobile-nav-open', isOpen);
    toggle.setAttribute('aria-expanded', String(isOpen));
    backdrop.hidden = !isOpen;
    document.body.style.overflow = isOpen ? 'hidden' : '';
  };

  toggle.addEventListener('click', () => setOpen(!document.body.classList.contains('mobile-nav-open')));
  close.addEventListener('click', () => setOpen(false));
  backdrop.addEventListener('click', () => setOpen(false));
  sidebar.querySelectorAll('button[data-view]').forEach((button) => {
    button.addEventListener('click', () => { if (mobileQuery.matches) setOpen(false); });
  });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') setOpen(false); });
  const handleBreakpoint = () => setOpen(false);
  if (mobileQuery.addEventListener) mobileQuery.addEventListener('change', handleBreakpoint);
  else mobileQuery.addListener(handleBreakpoint);
})();
