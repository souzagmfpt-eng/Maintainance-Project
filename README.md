# Gestão de Manutenção — GitHub Pages + Supabase

Projeto estático preparado a partir da aplicação de manutenção fornecida. O dashboard conserva os fluxos existentes para ordens de trabalho, indicadores, calendário de trabalho, inventário, fornecedores, compras e importação/exportação. O HTML/CSS/JavaScript foi separado em ficheiros, e foi adicionada uma camada de autenticação e sincronização cloud.

> **Estado da entrega:** a estrutura e o código estão preparados, mas é necessário configurar um projeto Supabase, executar `supabase/schema.sql`, preencher os dois valores públicos em `assets/js/config.js` e autorizar pelo menos um utilizador. Não é possível testar autenticação ou uploads reais sem as credenciais do seu projeto.

## Estrutura do repositório

```text
.
├── index.html                         # Entrada do GitHub Pages → login
├── login.html                         # Alias de compatibilidade para views/login.html
├── dashboard.html                     # Alias de compatibilidade para views/dashboard.html
├── views/
│   ├── login.html                     # Ecrã de autenticação (sem criação pública de contas)
│   ├── dashboard.html                 # Vistas da aplicação de manutenção
│   └── components/README.md           # Plano para futura extração de componentes reutilizáveis
├── assets/
│   ├── css/
│   │   ├── app.css                    # CSS extraído e preservado por ordem de cascata
│   │   ├── auth.css                   # Estilos do login
│   │   └── cloud-status.css           # Estado de sincronização e aviso Realtime
│   └── js/
│       ├── config.js                  # URL Supabase + chave pública, sem segredos
│       ├── auth-service.js             # Sessão e verificação de membro autorizado
│       ├── controllers/
│       │   ├── login-controller.js
│       │   └── dashboard-bootstrap.js # Gate de autenticação, hidratação e boot
│       ├── services/
│       │   ├── data-storage-service.js # JSONB, Storage PDF, IndexedDB, Realtime
│       │   └── excel-import-service.js # Fachada para a importação já existente
│       └── legacy/                     # Scripts originais divididos, carregados pela ordem original
├── supabase/schema.sql                # Tabelas, RLS, bucket privado e Realtime
├── docs/                              # Notas técnicas de migração
├── scripts/package_project.py         # Gera um ZIP do repositório
└── README.md
```

Os scripts antigos são carregados como scripts JavaScript clássicos pela ordem original porque partilham funções e variáveis globais. Isso conserva a aplicação e facilita uma migração gradual para módulos mais pequenos, sem misturar novamente código no HTML.

## 1. Criar e configurar o Supabase

1. Crie um projeto em [Supabase](https://supabase.com/). O plano gratuito pode ser suficiente para começar; confirme sempre os limites vigentes para autenticação, base de dados, Realtime e armazenamento.
2. No painel do projeto, abra **SQL Editor** e execute o conteúdo completo de [`supabase/schema.sql`](./supabase/schema.sql).
3. Em **Project Settings → API** (ou **Connect**, consoante a interface), copie o URL do projeto e a chave pública **publishable** ou a chave antiga **anon**.
4. Edite `assets/js/config.js` e substitua os dois valores de exemplo:

   ```js
   window.MAINTENANCE_CONFIG = Object.freeze({
     supabaseUrl: 'https://O_SEU_PROJECT_REF.supabase.co',
     supabaseAnonKey: 'A_SUA_CHAVE_PUBLICA_PUBLISHABLE_OU_ANON',
     storageBucket: 'maintenance-documents'
   });
   ```

   O URL e a chave **publishable/anon** são valores de cliente, visíveis no navegador. A segurança deve ser aplicada nas políticas RLS. **Nunca** coloque `service_role`, uma secret key, passwords, tokens privados ou credenciais administrativas no repositório ou no HTML/JavaScript.

5. Em **Authentication → Settings** desative **Allow new users to sign up**. Mantenha a confirmação do email ativada conforme a política da organização. A página de login não tem formulário de registo público.
6. Em **Authentication → Users**, convide ou crie manualmente a sua conta. Copie o UUID desse utilizador. No SQL Editor, execute:

   ```sql
   insert into public.app_members (user_id, role)
   values ('UUID_DO_UTILIZADOR', 'admin');
   ```

   Para cada novo utilizador autorizado, convide-o em Authentication e adicione o UUID à tabela `app_members` com role `member`. A aplicação não permite que um utilizador se insira a si próprio nesta tabela.
7. Em **Authentication → URL Configuration**, adicione o endereço do seu site GitHub Pages às URLs permitidas, por exemplo `https://UTILIZADOR.github.io/NOME-REPOSITORIO/`, além do endereço local utilizado nos testes.

### Como a autorização funciona

- `login.html` autentica com Supabase Auth usando email e password.
- Antes de carregar o dashboard, o sistema exige uma sessão válida **e** uma linha correspondente em `public.app_members`.
- `public.maintenance_state` guarda a aplicação como JSONB e tem RLS que permite acesso apenas a membros autorizados.
- `maintenance-documents` é um bucket privado. As políticas do Storage permitem operações apenas a membros autorizados.
- A tabela `app_members` não permite autoinscrição pela API do browser; os membros são provisionados pelo administrador.
- A chave pública não é um segredo. A barreira real está nas regras RLS/Storage do servidor.

Documentação oficial: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [Auth general configuration](https://supabase.com/docs/guides/auth/general-configuration), [Instalação de supabase-js](https://supabase.com/docs/reference/javascript/installing).

## 2. Executar localmente

Como a aplicação usa a biblioteca Supabase via CDN e ficheiros estáticos, sirva a pasta por HTTP local em vez de abrir `file://` diretamente. Por exemplo, com Python instalado:

```bash
cd gestao-manutencao-github-pages
python -m http.server 8000
```

Abra `http://localhost:8000/`. Configure também esse URL em Authentication → URL Configuration, e configure `assets/js/config.js` antes de iniciar sessão.

A sessão expira/renova-se segundo as regras do Supabase. Um utilizador autenticado sem uma linha `app_members` não obtém acesso aos dados.

## 3. Publicar no GitHub Pages

1. Crie um repositório no GitHub e carregue esta estrutura completa (não apenas `dashboard.html`).
2. Em **Settings → Pages**, escolha a branch principal e a pasta `/ (root)`.
3. Aguarde a publicação do GitHub Pages e abra o endereço indicado. `index.html` encaminha para `views/login.html`.
4. Confirme que o endereço final e o endereço de login/reset configurado no Supabase correspondem ao projeto Pages.
5. Faça o teste com uma conta autorizada e outra conta sem membership: a segunda não deve conseguir ler nem alterar o JSON nem os ficheiros, mesmo através de chamadas diretas à API.

GitHub Pages fornece alojamento estático. Não processa uploads nem mantém ficheiros JSON graváveis no repositório; essas operações passam pelo Supabase.

## 4. Dados, sincronização e PDF

- O estado da aplicação é guardado na tabela `maintenance_state` como um documento JSONB partilhado entre membros autorizados.
- O estado local continua a funcionar como cache temporária; alterações em chaves `gestao_manutencao_*` são sincronizadas após um pequeno atraso.
- Os PDFs do inventário e ficheiros/catálogos de fornecedores são enviados para o bucket privado `maintenance-documents`. Os seus metadados guardam o caminho `storagePath`, para que o dashboard os possa descarregar e recuperar no arranque noutro computador.
- A subscrição Realtime deteta atualizações feitas noutro navegador e mostra um botão para recarregar os dados mais recentes.
- A aplicação conserva também a exportação completa ZIP existente, para cópias offline e migração manual.

**Nota sobre edição simultânea:** o modelo inicial guarda um único JSON partilhado. Assim, duas pessoas a gravarem ao mesmo tempo podem produzir uma política de “última gravação vence”. Para uso simultâneo intenso, passe para tabelas normalizadas ou introduza controlo de versão/concorrência, conforme descrito em [Próximos Passos](#5-próximos-passos-migração-para-postgresql-e-back-end-próprio).

## 5. Importação de Excel (.xlsx / .csv)

O dashboard mantém o parser no front-end para importar `.xlsx`, `.csv`, `.txt` e cópias JSON. Não é necessário carregar a folha para um servidor para fazer a leitura: o browser interpreta as linhas, apresenta a confirmação de importação e atualiza as OTs/registos locais. O serviço de sincronização deteta as alterações e grava o novo estado JSONB no Supabase. O upload de um ficheiro de origem inteiro não é necessário.

- Use o botão **Importar ficheiro** no menu lateral.
- Prefira `.xlsx` ou `.csv`. Ficheiros `.xls` antigos devem ser guardados como `.xlsx` ou `.csv` antes da importação.
- Reveja o resumo/duplicados e confirme antes de gravar.
- Após a importação, aguarde que o estado no topo indique sincronização concluída. Se aparecer erro, verifique a ligação, as permissões RLS e a configuração do projeto antes de fechar o separador.

## 6. Gerar a estrutura de pastas e criar o ZIP

A estrutura já vem incluída neste pacote. Se quiser gerar automaticamente uma nova cópia de toda a pasta de projeto — sem criar ficheiros à mão — execute na raiz do projeto:

```bash
python scripts/generate_project.py
```

Por omissão, cria a pasta `../gestao-manutencao-gerado`. Para criar essa pasta e também produzir um ZIP:

```bash
python scripts/generate_project.py --output-dir ../gestao-manutencao-entrega --zip
```

Depois de alterar os ficheiros existentes, pode gerar apenas um novo ZIP:

```bash
python scripts/package_project.py
# ou indicar caminho:
python scripts/package_project.py --output ./entrega/gestao-manutencao.zip
```

O empacotador cria, por omissão, `dist/gestao-manutencao-github-pages.zip`. Os dois scripts usam apenas a biblioteca padrão do Python. O ZIP entregue com esta tarefa já contém a estrutura completa; não é necessário executar nenhum script para começar a configurar o Supabase.

## 7. Git e segurança operacional

- Nunca comite passwords pessoais, tokens, chaves secretas, chaves `service_role`, exports com dados reais ou PDFs confidenciais no repositório público.
- Se o repositório for público, a aplicação e o código serão visíveis. Isso é esperado num front-end estático; a proteção dos dados é feita no Supabase.
- Considere um repositório privado se o código, os nomes dos equipamentos ou a documentação técnica também forem confidenciais.
- Faça cópias ZIP regulares e teste uma restauração num ambiente separado.
- Restrinja os utilizadores em `app_members`, revogue acessos quando alguém sair e reveja as políticas RLS sempre que criar tabelas ou buckets adicionais.
- O armazenamento de PDF tem um limite configurado de 25 MB por ficheiro, em linha com o limite do formulário da aplicação. Confirme os limites do seu plano Supabase.

## 8. Próximos Passos: migração para PostgreSQL/MySQL e back-end próprio

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

---

## Limitações conhecidas desta primeira fase

- É uma migração incremental que preserva lógica global antiga em scripts separados, e não uma reescrita total baseada em módulos ES.
- Os dados do domínio são guardados como um documento JSON partilhado por simplicidade de migração; não substitui o desenho relacional para equipas a editar em simultâneo com elevada frequência.
- Autenticação/Storage real só ficam operacionais depois da configuração do seu projeto Supabase e da atribuição de membros.
