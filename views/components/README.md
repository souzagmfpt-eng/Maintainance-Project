# Componentes da interface

O dashboard atual foi separado do CSS e JavaScript, mas as secções HTML da interface de manutenção continuam reunidas em `../dashboard.html` para evitar regressões durante a migração inicial. Ao fazer a próxima refatoração, extraia componentes reutilizáveis (por exemplo, navegação lateral, cabeçalho, modal de confirmação e cartões KPI) para templates HTML/JS ou Web Components e inclua testes de cada componente. Não foram criados HTMLs de componentes não utilizados.
