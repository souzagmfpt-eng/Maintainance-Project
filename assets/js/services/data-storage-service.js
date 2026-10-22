/*
 * Estado partilhado em Postgres (JSONB) + anexos no Supabase Storage.
 * A aplicação legada mantém um cache local para preservar a experiência existente;
 * as alterações nas chaves gestao_manutencao_* são sincronizadas para a cloud.
 */
(function () {
  'use strict';
  const STATE_TABLE = 'maintenance_state';
  const BUCKET = (window.MAINTENANCE_CONFIG && window.MAINTENANCE_CONFIG.storageBucket) || 'maintenance-documents';
  const PREFIX = 'gestao_manutencao_';
  const INVENTORY_KEY = 'gestao_manutencao_inventory_v1';
  const SUPPLIERS_KEY = 'gestao_manutencao_suppliers_v1';
  const DB_NAME = 'gestao_manutencao_catalogos_v1';
  const DB_VERSION = 2;
  let client = null, user = null, timer = null, syncing = false, needsAnotherSync = false, applyingRemote = false, realtimeChannel = null;
  let onRemoteChange = null, latestUpdatedAt = null;
  const listeners = new Set();

  function status(state, label) {
    const el = document.getElementById('cloudSyncStatus');
    if (el) { el.dataset.state = state; el.textContent = label; el.title = label; }
    listeners.forEach(fn => { try { fn({state, label}); } catch {} });
  }
  function onStatus(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  function init(supabaseClient, session) { client = supabaseClient; user = session.user; }
  function getClient() { if (!client || !user) throw new Error('A sessão cloud não está inicializada.'); return client; }
  function collectLocalState() {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PREFIX)) out[key] = localStorage.getItem(key);
    }
    return out;
  }
  function safeStoragePathPart(value) {
    const s = String(value ?? 'doc').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
    return s || 'doc';
  }
  function dataUrlToBlob(dataUrl, fallbackType) {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null;
    const comma = dataUrl.indexOf(','); if (comma < 0) return null;
    const head = dataUrl.slice(5, comma), body = dataUrl.slice(comma + 1), match = head.match(/^([^;]+)/);
    const type = match?.[1] || fallbackType || 'application/octet-stream';
    try {
      const raw = head.includes(';base64') ? atob(body) : decodeURIComponent(body);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      return new Blob([bytes], { type });
    } catch { return null; }
  }
  function requestResult(req) { return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error || new Error('Erro ao ler IndexedDB.')); }); }
  async function openCatalogDB() {
    if (!('indexedDB' in window)) throw new Error('Este navegador não disponibiliza IndexedDB para guardar anexos.');
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('catalogs')) db.createObjectStore('catalogs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('inventoryPdfs')) db.createObjectStore('inventoryPdfs', { keyPath: 'id' });
    };
    return requestResult(req);
  }
  async function readAll(db, storeName) {
    if (!db.objectStoreNames.contains(storeName)) return [];
    const tx = db.transaction(storeName, 'readonly');
    return requestResult(tx.objectStore(storeName).getAll());
  }
  async function putDocument(db, storeName, record) {
    const tx = db.transaction(storeName, 'readwrite');
    await requestResult(tx.objectStore(storeName).put(record));
  }
  async function readJsonKey(key) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : []; }
    catch { return []; }
  }
  async function uploadFile(path, blob, contentType) {
    const api = getClient();
    const { error } = await api.storage.from(BUCKET).upload(path, blob, {
      upsert: true, contentType: contentType || blob.type || 'application/octet-stream', cacheControl: '3600'
    });
    if (error) throw error;
  }
  async function syncDocumentsToStorage() {
    let db;
    try { db = await openCatalogDB(); }
    catch (err) {
      // A base IndexedDB inexistente não é erro para quem ainda não anexou ficheiros.
      if (err?.message?.includes('IndexedDB')) return { uploaded: 0, total: 0 };
      throw err;
    }
    try {
      const [pdfRecords, catalogRecords] = await Promise.all([readAll(db, 'inventoryPdfs'), readAll(db, 'catalogs')]);
      const pdfById = new Map(pdfRecords.map(x => [String(x.id), x]));
      const catalogById = new Map(catalogRecords.map(x => [String(x.id), x]));
      const inventory = await readJsonKey(INVENTORY_KEY);
      const suppliers = await readJsonKey(SUPPLIERS_KEY);
      let uploaded = 0, total = 0, changedInv = false, changedSup = false;
      for (const item of (Array.isArray(inventory) ? inventory : [])) {
        for (const pdf of (Array.isArray(item.pdfs) ? item.pdfs : [])) {
          total++;
          const rec = pdfById.get(String(pdf.id));
          let blob = rec?.blob instanceof Blob ? rec.blob : dataUrlToBlob(pdf.dataUrl, 'application/pdf');
          if (!blob && !pdf.storagePath) continue;
          const path = pdf.storagePath || `inventory/${safeStoragePathPart(item.id)}/${safeStoragePathPart(pdf.id)}.pdf`;
          if (!pdf.storagePath && blob) {
            if (blob.type !== 'application/pdf' && !String(pdf.name || '').toLowerCase().endsWith('.pdf')) throw new Error(`O anexo “${pdf.name || pdf.id}” não está identificado como PDF.`);
            await uploadFile(path, blob, 'application/pdf');
            pdf.storagePath = path; delete pdf.dataUrl; changedInv = true; uploaded++;
            if (rec) await putDocument(db, 'inventoryPdfs', { ...rec, storagePath:path, storageSyncedAt:Date.now() });
          } else if (pdf.storagePath && rec && blob && !rec.storageSyncedAt) {
            const parts = path.split('/'), name = parts.pop(), folder = parts.join('/');
            const { data, error } = await getClient().storage.from(BUCKET).list(folder, { search:name });
            if (error) throw error;
            if (!data?.some(file => file.name === name)) { await uploadFile(path, blob, 'application/pdf'); uploaded++; }
            await putDocument(db, 'inventoryPdfs', { ...rec, storagePath:path, storageSyncedAt:Date.now() });
          }
        }
      }
      for (const supplier of (Array.isArray(suppliers) ? suppliers : [])) {
        for (const catalog of (Array.isArray(supplier.catalogs) ? supplier.catalogs : [])) {
          total++;
          const rec = catalogById.get(String(catalog.id));
          let blob = rec?.blob instanceof Blob ? rec.blob : dataUrlToBlob(catalog.dataUrl, catalog.type);
          if (!blob && !catalog.storagePath) continue;
          const safeName = safeStoragePathPart(catalog.id) + (String(catalog.name || '').toLowerCase().endsWith('.pdf') ? '.pdf' : '.bin');
          const path = catalog.storagePath || `suppliers/${safeStoragePathPart(supplier.id)}/${safeName}`;
          if (!catalog.storagePath && blob) {
            await uploadFile(path, blob, catalog.type || blob.type);
            catalog.storagePath = path; delete catalog.dataUrl; changedSup = true; uploaded++;
            if (rec) await putDocument(db, 'catalogs', { ...rec, storagePath:path, storageSyncedAt:Date.now() });
          } else if (catalog.storagePath && rec && blob && !rec.storageSyncedAt) {
            const parts = path.split('/'), name = parts.pop(), folder = parts.join('/');
            const { data, error } = await getClient().storage.from(BUCKET).list(folder, { search:name });
            if (error) throw error;
            if (!data?.some(file => file.name === name)) { await uploadFile(path, blob, catalog.type || blob.type); uploaded++; }
            await putDocument(db, 'catalogs', { ...rec, storagePath:path, storageSyncedAt:Date.now() });
          }
        }
      }
      if (changedInv) localStorage.setItem(INVENTORY_KEY, JSON.stringify(inventory));
      if (changedSup) localStorage.setItem(SUPPLIERS_KEY, JSON.stringify(suppliers));
      return { uploaded, total };
    } finally { db.close(); }
  }
  async function loadState() {
    status('busy', 'A carregar dados…');
    const api = getClient();
    const { data, error } = await api.from(STATE_TABLE).select('payload, updated_at, updated_by').eq('id', 'shared').maybeSingle();
    if (error) throw error;
    latestUpdatedAt = data?.updated_at || null;
    return data || null;
  }
  function applyPayload(payload) {
    if (!payload || typeof payload !== 'object' || !payload.localStorage || typeof payload.localStorage !== 'object') return;
    applyingRemote = true;
    try {
      const currentKeys = [];
      for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if (key?.startsWith(PREFIX)) currentKeys.push(key); }
      currentKeys.forEach(key => localStorage.removeItem(key));
      for (const [key, value] of Object.entries(payload.localStorage)) {
        if (key.startsWith(PREFIX) && typeof value === 'string') localStorage.setItem(key, value);
      }
    } finally { applyingRemote = false; }
  }
  async function restoreDocumentsFromStorage() {
    const api = getClient();
    const inventory = await readJsonKey(INVENTORY_KEY), suppliers = await readJsonKey(SUPPLIERS_KEY);
    const tasks = [];
    for (const item of (Array.isArray(inventory) ? inventory : [])) for (const pdf of (Array.isArray(item.pdfs) ? item.pdfs : [])) if (pdf.storagePath) tasks.push({ store:'inventoryPdfs', parentId:item.id, meta:pdf, path:pdf.storagePath });
    for (const supplier of (Array.isArray(suppliers) ? suppliers : [])) for (const catalog of (Array.isArray(supplier.catalogs) ? supplier.catalogs : [])) if (catalog.storagePath) tasks.push({ store:'catalogs', parentId:supplier.id, meta:catalog, path:catalog.storagePath });
    if (!tasks.length) return { downloaded:0 };
    const db = await openCatalogDB(); let downloaded = 0;
    try {
      const [existingPdfs, existingCatalogs] = await Promise.all([readAll(db, 'inventoryPdfs'), readAll(db, 'catalogs')]);
      const existingIds = {
        inventoryPdfs: new Set(existingPdfs.filter(x => x.blob instanceof Blob).map(x => String(x.id))),
        catalogs: new Set(existingCatalogs.filter(x => x.blob instanceof Blob).map(x => String(x.id)))
      };
      for (const task of tasks) {
        if (existingIds[task.store]?.has(String(task.meta.id))) continue;
        const { data, error } = await api.storage.from(BUCKET).download(task.path);
        if (error) throw new Error(`Não foi possível descarregar “${task.meta.name || task.path}” do Storage: ${error.message}`);
        const record = { ...task.meta, id:task.meta.id, name:task.meta.name, type:task.meta.type || data.type || 'application/pdf', size:data.size, addedAt:task.meta.addedAt || new Date().toISOString(), blob:data };
        if (task.store === 'inventoryPdfs') record.itemId = task.parentId; else record.supplierId = task.parentId;
        await putDocument(db, task.store, record); downloaded++;
      }
    } finally { db.close(); }
    return { downloaded };
  }
  async function flushNow() {
    if (!client || !user || syncing) return;
    syncing = true; status('busy', 'A sincronizar…');
    try {
      const docs = await syncDocumentsToStorage();
      const payload = { schemaVersion:1, app:'Gestão de Manutenção OT', savedAt:new Date().toISOString(), localStorage:collectLocalState() };
      const api = getClient();
      const { data, error } = await api.from(STATE_TABLE).upsert({ id:'shared', payload, updated_by:user.id, updated_at:new Date().toISOString() }, { onConflict:'id' }).select('updated_at').single();
      if (error) throw error;
      latestUpdatedAt = data?.updated_at || new Date().toISOString();
      status('online', `Sincronizado${docs.uploaded ? ` · ${docs.uploaded} anexo(s)` : ''}`);
    } catch (err) {
      console.error('[CloudSync]', err);
      status('error', 'Erro de sincronização');
      showError(`Os dados ficaram guardados localmente, mas não foi possível sincronizá-los com a cloud. ${err?.message || ''}`);
    } finally {
      syncing = false;
      if (needsAnotherSync) {
        needsAnotherSync = false;
        clearTimeout(timer);
        timer = setTimeout(() => { flushNow(); }, 250);
      }
    }
  }
  function showError(text) {
    let el = document.getElementById('cloudErrorNotice');
    if (!el) { el = document.createElement('div'); el.id = 'cloudErrorNotice'; el.style.cssText = 'position:fixed;z-index:99995;left:16px;bottom:16px;max-width:min(640px,calc(100vw - 32px));padding:13px 16px;border:1px solid #f0d0d3;border-radius:10px;background:#fff3f4;color:#95313a;box-shadow:0 10px 30px #1737481c;font:12px/1.55 system-ui,sans-serif;'; document.body.appendChild(el); }
    el.textContent = text;
    clearTimeout(el._hideTimer); el._hideTimer = setTimeout(() => el.remove(), 12000);
  }
  function scheduleSync() {
    if (!client || !user || applyingRemote) return;
    if (syncing) { needsAnotherSync = true; return; }
    status('busy', 'Alterações por sincronizar…');
    clearTimeout(timer); timer = setTimeout(() => { flushNow(); }, 1300);
  }
  function installLocalStorageWatcher() {
    if (window.__maintenanceWatcherInstalled) return;
    const proto = Storage.prototype;
    const nativeSet = proto.setItem;
    const nativeRemove = proto.removeItem;
    proto.setItem = function (key, value) {
      nativeSet.call(this, key, value);
      if (this === localStorage && String(key).startsWith(PREFIX)) scheduleSync();
    };
    proto.removeItem = function (key) {
      nativeRemove.call(this, key);
      if (this === localStorage && String(key).startsWith(PREFIX)) scheduleSync();
    };
    window.__maintenanceWatcherInstalled = true;
  }
  function subscribeRealtime(callback) {
    onRemoteChange = callback || null;
    if (!client || realtimeChannel) return;
    realtimeChannel = client.channel('maintenance-state-live-sync').on('postgres_changes', { event:'*', schema:'public', table:STATE_TABLE, filter:'id=eq.shared' }, payload => {
      const record = payload?.new;
      if (!record || !record.updated_at || record.updated_by === user?.id || record.updated_at === latestUpdatedAt) return;
      latestUpdatedAt = record.updated_at;
      if (typeof onRemoteChange === 'function') onRemoteChange(record);
    }).subscribe((state) => { if (state === 'SUBSCRIBED') status('online', 'Ligado à cloud'); });
  }
  function isApplyingRemote() { return applyingRemote; }
  window.MaintenanceDataService = Object.freeze({ init, loadState, applyPayload, restoreDocumentsFromStorage, flushNow, scheduleSync, installLocalStorageWatcher, subscribeRealtime, onStatus, isApplyingRemote, status });
})();
