# Migração para base de dados relacional e back-end próprio

## Próximos Passos: migração para PostgreSQL/MySQL e back-end próprio

A camada cloud foi isolada em `assets/js/services/data-storage-service.js`; autenticação fica em `assets/js/auth-service.js`. Para trocar o BaaS por uma base de dados e um back-end dedicado, siga a sequência:

### Fase A — estabilizar o contrato de dados

1. Identifique os domínios da aplicação: `work_orders`, `inventory_items`, `suppliers`, `purchase_requests`, `work_order_tasks`, `inventory_documents`, `supplier_documents` e tabelas de histórico/auditoria.
2. Documente IDs estáveis, referências entre OTs/compras/itens/fornecedores, estados permitidos, timestamps e regras de eliminação. Não use o texto visível (por exemplo, número da OT) como única chave primária.
3. Crie tipos/validadores de entrada e um conjunto de dados de teste. Escreva migrações SQL e testes que assegurem as relações e a integridade.
4. Introduza uma interface estável de dados (por exemplo, `MaintenanceRepository`) com métodos como `listOrders`, `saveOrder`, `listInventory`, `savePurchase`, `uploadDocument` e `downloadDocument`. A interface da aplicação não deve conhecer queries SQL diretamente.

### Fase B — desenhar um esquema relacional

Um esquema possível em PostgreSQL/MySQL:

- `users` (ID do fornecedor de identidade, email, estado, role);
- `work_orders` (ID, número único, datas, prioridade, estado, localização, equipamento, descrição, trabalho realizado, criado/alterado por);
- `work_order_tasks` (ID, `work_order_id` FK, descrição e estado);
- `inventory_items` (ID, referência única quando aplicável, nome, tipo, marca, localização, quantidade, mínimo, unidade, condição);
- `suppliers` e `inventory_item_suppliers` (relação N:N entre artigos e fornecedores);
- `purchase_requests` (ID, artigo opcional, fornecedor, OT associada, quantidades, estado, datas e notas);
- `documents` (ID, entidade/tipo, ID da entidade, nome original, MIME type, tamanho, storage key, hash, data de upload e autor);
- `audit_log` (ator, ação, tabela/entidade, ID, timestamp e alterações relevantes).

Escolha `jsonb` apenas para atributos variáveis que precisem mesmo de flexibilidade. Dados usados em filtros, relatórios e relações devem ter colunas relacionais e índices. Se escolher MySQL, converta constraints e tipos para o dialeto apropriado.

### Fase C — criar o back-end Node.js

1. Crie um serviço Node.js/TypeScript, por exemplo com Fastify ou Express, com camadas `routes`, `controllers`, `services`, `repositories`, `schemas` e `middleware`.
2. Crie uma API versionada `/api/v1` com endpoints REST para OTs, inventário, fornecedores, compras e documentos.
3. Valide todos os payloads no servidor (Zod, TypeBox ou equivalente); não confie em validação apenas no browser.
4. Implemente autenticação com sessão/cookies seguros ou tokens de curta duração validados no servidor; exija autorização por role para operações administrativas.
5. Use variáveis de ambiente no servidor para credenciais de PostgreSQL/MySQL, chaves de armazenamento e segredos. Nunca as envie ao front-end.
6. Aplique migrações com ferramenta explícita (Prisma Migrate, Drizzle, Knex ou SQL versionado), prepared statements/ORM e transações em operações que alteram várias entidades.
7. Para PDFs, use armazenamento de objetos privado (por exemplo, S3 compatível) e URLs pré-assinados de curta duração, ou streaming por endpoint autenticado. Guarde apenas metadados e chaves no banco relacional.
8. Adicione logs estruturados, auditoria, rate limiting, limites de tamanho/tipo dos ficheiros, validação de MIME/sinal do conteúdo, proteção contra malware conforme o risco, CORS restrito e backups testados.

### Fase D — migrar dados com baixo risco

1. Faça uma exportação ZIP/JSON da aplicação e valide a cópia de segurança.
2. Escreva um importador de migração idempotente que traduza o JSON antigo para as tabelas relacionais, preservando IDs ou criando um mapa `legacy_id → new_id`.
3. Migre os documentos para o novo storage e atualize a tabela `documents` com os novos caminhos. Calcule hashes para verificar que os bytes foram preservados.
4. Compare contagens e amostras de OTs, inventário, fornecedores, compras e documentos entre origem e destino.
5. Execute um período de teste em leitura/duplicação, suspenda escritas durante o corte final, faça migração incremental final e mantenha o backup antigo para rollback.
6. Troque apenas a implementação do `MaintenanceRepository`/`DataStorageService`; mantenha os controladores e o HTML tão independentes quanto possível.

### Fase E — operação

- Aloje o back-end num serviço com suporte a Node.js (por exemplo, uma plataforma de aplicações/containers), pois o GitHub Pages não executa processos de servidor.
- Configure HTTPS, domínios, CORS, segredos e migrações no pipeline de deploy.
- Automatize testes de unidade e integração, incluindo testes de acesso não autorizado, importação Excel, upload/download PDF, falhas de rede e recuperação de backup.
- Só desligue o Supabase depois de confirmar a integridade dos dados migrados e o funcionamento das políticas de backup/recuperação no novo ambiente.
