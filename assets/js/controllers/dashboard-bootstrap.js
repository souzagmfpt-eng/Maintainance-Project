(function () {
  'use strict';
  const auth = window.MaintenanceAuth;
  const dataService = window.MaintenanceDataService;
  const legacyFiles = [
    '../assets/js/legacy/01-core.js',
    '../assets/js/legacy/02-purchases-indicators.js',
    '../assets/js/legacy/03-import-export.js',
    '../assets/js/legacy/04-worktime-calendar.js',
    '../assets/js/legacy/05-back-to-top.js',
    '../assets/js/legacy/06-inventory-suppliers.js',
    '../assets/js/legacy/07-inventory-item-detail.js',
    '../assets/js/legacy/08-complete-backup-zip.js'
  ];
  function showBlockingError(title, message) {
    document.body.classList.remove('app-loading');
    document.body.innerHTML = `<main style="min-height:100vh;display:grid;place-items:center;padding:24px;background:#f1f5f6;font:14px/1.65 system-ui;color:#203740"><section style="max-width:720px;background:#fff;padding:32px;border:1px solid #dce6e6;border-radius:16px;box-shadow:0 15px 50px #16344712"><h1 style="margin-top:0;font-size:23px">${title}</h1><p>${String(message).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</p><p>Consulte o <a href="../README.md">README.md</a> e o ficheiro <code>../supabase/schema.sql</code> para concluir a configuração.</p><a href="./login.html">Voltar ao início de sessão</a></section></main>`;
  }
  function loadClassicScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src; script.async = false;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Não foi possível carregar ${src}`));
      document.body.appendChild(script);
    });
  }
  function setupRealtimeNotice() {
    dataService.subscribeRealtime(record => {
      let notice = document.getElementById('remoteUpdateNotice');
      if (!notice) {
        notice = document.createElement('div'); notice.id = 'remoteUpdateNotice';
        notice.innerHTML = '<span>Outro utilizador guardou alterações. Atualize a página para carregar os dados mais recentes.</span><button type="button">Atualizar agora</button>';
        notice.querySelector('button').addEventListener('click', () => location.reload());
        document.body.appendChild(notice);
      }
      notice.dataset.updatedAt = record.updated_at;
    });
  }
  async function start() {
    try {
      if (!auth || !auth.isConfigured()) throw new Error(auth?.configurationMessage() || 'A configuração do Supabase está incompleta.');
      const session = await auth.getSession();
      if (!session) { location.replace('./login.html'); return; }
      let membership;
      try { membership = await auth.isMember(session.user.id); }
      catch (error) { throw new Error('A autenticação funcionou, mas a lista de membros não está acessível. Execute supabase/schema.sql e adicione esta conta a public.app_members. Detalhe: ' + (error?.message || 'erro desconhecido')); }
      if (!membership) { await auth.signOut(); location.replace('./login.html?reason=unauthorized'); return; }
      const api = await auth.getClient();
      dataService.init(api, session);
      const serverState = await dataService.loadState();
      if (serverState?.payload) dataService.applyPayload(serverState.payload);
      // Os PDFs são descarregados para IndexedDB antes de a interface legada ser iniciada.
      if (serverState?.payload) await dataService.restoreDocumentsFromStorage();
      const email = document.getElementById('signedInAs'); if (email) { email.textContent = session.user.email || 'Sessão iniciada'; email.title = session.user.email || ''; }
      const logout = document.getElementById('logoutBtn');
      logout?.addEventListener('click', async () => {
        logout.disabled = true;
        try { await dataService.flushNow(); await auth.signOut(); location.replace('./login.html'); }
        catch (err) { logout.disabled = false; alert('Não foi possível terminar a sessão: ' + (err?.message || 'erro desconhecido')); }
      });
      for (const file of legacyFiles) await loadClassicScript(file);
      dataService.installLocalStorageWatcher();
      setupRealtimeNotice();
      await dataService.flushNow();
      const loader = document.getElementById('appLoader');
      document.body.classList.remove('app-loading');
      if (loader) { loader.classList.add('loader-exit'); setTimeout(() => loader.remove(), 600); }
      window.addEventListener('online', () => dataService.flushNow());
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') dataService.flushNow(); });
    } catch (error) {
      console.error('[Bootstrap]', error);
      showBlockingError('Não foi possível abrir o sistema', error?.message || 'Verifique a configuração e tente novamente.');
    }
  }
  start();
})();
