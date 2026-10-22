# Notas de arquitetura

## Fluxo de entrada

`index.html` → `views/login.html` → Supabase Auth → `app_members` → `views/dashboard.html`.

O `dashboard-bootstrap.js` interrompe a inicialização se não houver sessão ou membership válida. Só depois lê o estado JSONB e restaura os documentos disponíveis, e então carrega os scripts da interface antiga sequencialmente.

## Dados

`MaintenanceDataService` usa `maintenance_state(id='shared')` como adaptador de transição para a aplicação já existente. As chaves locais `gestao_manutencao_*` são guardadas dentro de um payload JSONB. O serviço também sincroniza os blobs dos stores IndexedDB `inventoryPdfs` e `catalogs` com o bucket privado `maintenance-documents`; o caminho do objeto fica nos metadados (`storagePath`).

## Regras de segurança

- O site não possui credenciais privilegiadas.
- `app_members` só permite ao cliente ler a própria membership.
- Apenas contas registadas em `app_members` conseguem ler/escrever o estado partilhado ou operar sobre o bucket.
- Novos membros são acrescentados pelo administrador através de SQL ou por um painel administrativo server-side futuro.
- A autorização no front-end serve para UX; as políticas RLS são a fronteira de segurança efetiva.

## Concorrência

A linha única `maintenance_state` é uma ponte de migração, com política de última gravação vence. Não é adequada a muitos escritores simultâneos. Próxima evolução: tabelas relacionais + endpoints/serviços por entidade, ou pelo menos `version`/ETag e update condicional.
