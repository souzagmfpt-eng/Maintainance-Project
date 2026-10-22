(function () {
  'use strict';
  const form = document.getElementById('loginForm');
  const message = document.getElementById('authMessage');
  const button = document.getElementById('loginButton');
  const auth = window.MaintenanceAuth;
  function show(text, type = 'error') { message.textContent = text; message.className = `message show ${type}`; }
  function setBusy(busy) { button.disabled = busy; button.textContent = busy ? 'A validar acesso…' : 'Iniciar sessão →'; }
  if (!auth || !auth.isConfigured()) {
    show(auth?.configurationMessage() || 'A autenticação não está disponível. Confirme a configuração do Supabase.', 'error');
    button.disabled = true;
  } else if (new URLSearchParams(location.search).get('reason') === 'unauthorized') {
    show('A conta existe, mas não está autorizada a abrir a aplicação. Contacte o administrador.', 'error');
  }
  if (auth?.isConfigured()) {
    auth.getSession().then(async session => {
      if (!session) return;
      const membership = await auth.isMember(session.user.id);
      if (membership) location.replace('./dashboard.html');
      else { await auth.signOut(); show('A conta não está na lista de utilizadores autorizados.', 'error'); }
    }).catch(err => { if (err?.message) show(err.message, 'error'); });
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!auth?.isConfigured()) return;
    setBusy(true); message.className = 'message';
    try {
      await auth.signIn(document.getElementById('email').value, document.getElementById('password').value);
      location.replace('./dashboard.html');
    } catch (err) {
      show(err?.message || 'Não foi possível iniciar sessão. Verifique os dados ou contacte o administrador.', 'error');
    } finally { setBusy(false); }
  });
})();
