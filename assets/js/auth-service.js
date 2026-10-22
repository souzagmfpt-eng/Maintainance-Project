/* Camada central de autenticação Supabase — sem credenciais privadas. */
(function () {
  'use strict';
  const cfg = window.MAINTENANCE_CONFIG || {};
  const hasClientLib = Boolean(window.supabase && typeof window.supabase.createClient === 'function');
  const hasPublicConfig = typeof cfg.supabaseUrl === 'string' && /^https:\/\//i.test(cfg.supabaseUrl) && !cfg.supabaseUrl.includes('YOUR_PROJECT_REF') && typeof cfg.supabaseAnonKey === 'string' && cfg.supabaseAnonKey.length > 20 && !cfg.supabaseAnonKey.includes('YOUR_SUPABASE');
  let client = null;
  if (hasClientLib && hasPublicConfig) {
    client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }
  async function requireClient() {
    if (!client) throw new Error('Supabase ainda não está configurado. Edite assets/js/config.js com o URL do projeto e a chave pública (publishable/anon).');
    return client;
  }
  async function getSession() {
    const api = await requireClient();
    const { data, error } = await api.auth.getSession();
    if (error) throw error;
    return data.session || null;
  }
  async function isMember(userId) {
    const api = await requireClient();
    const { data, error } = await api.from('app_members').select('user_id, role').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    return data || null;
  }
  async function signIn(email, password) {
    const api = await requireClient();
    const { data, error } = await api.auth.signInWithPassword({ email: String(email || '').trim(), password });
    if (error) throw error;
    try {
      const membership = await isMember(data.user.id);
      if (!membership) {
        await api.auth.signOut();
        throw new Error('Esta conta ainda não está autorizada a usar a aplicação. Contacte o administrador.');
      }
      return data;
    } catch (err) {
      if (err && /não está autorizada/.test(err.message || '')) throw err;
      await api.auth.signOut();
      throw new Error('Não foi possível validar as permissões desta conta. Confirme se o administrador configurou o esquema SQL e adicionou o utilizador à lista de membros.');
    }
  }
  async function signOut() {
    const api = await requireClient();
    const { error } = await api.auth.signOut();
    if (error) throw error;
  }
  window.MaintenanceAuth = Object.freeze({
    isConfigured: () => Boolean(client),
    configurationMessage: () => !hasClientLib ? 'Não foi possível carregar a biblioteca do Supabase. Verifique a ligação à Internet.' : !hasPublicConfig ? 'Configure assets/js/config.js com o URL do seu projeto Supabase e a chave pública publishable/anon. Não coloque a chave service_role.' : '',
    getClient: requireClient,
    getSession,
    isMember,
    signIn,
    signOut
  });
})();
