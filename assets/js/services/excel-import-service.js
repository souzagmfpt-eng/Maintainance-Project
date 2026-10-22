/*
 * Serviço fino para a funcionalidade de importação existente.
 * O parser XLSX/CSV do sistema legado está em assets/js/legacy/03-import-export.js
 * (é carregado como script clássico para preservar compatibilidade com os formulários atuais).
 * As importações gravam em localStorage; o DataStorageService sincroniza automaticamente
 * os registos importados para maintenance_state no Supabase, após a confirmação do utilizador.
 */
(function () {
  'use strict';
  window.ExcelImportService = Object.freeze({
    supportedExtensions: Object.freeze(['.xlsx', '.csv', '.txt', '.json']),
    isSupportedFile(file) {
      return Boolean(file && /\.(xlsx|csv|txt|json)$/i.test(String(file.name || '')));
    },
    async importFile(file) {
      if (!this.isSupportedFile(file)) throw new Error('Formato não suportado. Utilize XLSX, CSV, TXT ou JSON.');
      if (typeof window.importAnyFile !== 'function') throw new Error('O controlador de importação ainda não foi inicializado.');
      await window.importAnyFile(file);
      // A importação legada pede confirmação antes de alterar o estado. A gravação efetiva
      // é detetada pelo observador de localStorage quando o utilizador confirma.
      window.MaintenanceDataService?.scheduleSync();
    }
  });
})();
