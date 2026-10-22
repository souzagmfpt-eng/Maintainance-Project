# Origem dos scripts legados

A pasta `assets/js/legacy/` foi extraída do HTML monolítico fornecido para esta tarefa. Os blocos JavaScript foram preservados pela ordem original para reduzir o risco de regressão. O HTML e o CSS foram separados em `dashboard.html` e `assets/css/app.css`.

A camada de login, autorização, sincronização JSONB e Storage foi adicionada de forma independente. Antes de utilização em produção, configurar o Supabase, executar `supabase/schema.sql` e testar com contas autorizadas/não autorizadas.
