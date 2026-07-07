# CRM Kyro — Imobiliária (versão completa)

CRM com identidade preto/dourado/branco e 4 perfis: **Corretor, Gerente,
Secretaria/Diretoria**. Dados reais e compartilhados via **Supabase** (Postgres).

## Módulos
- **Corretor** → Leads (nome, telefone, e-mail, tipo, nicho, temperatura
  quente/morno/frio, valor do imóvel, status de venda, etiquetas editáveis,
  anotações, agendamento), Agenda com alerta de ligação, link direto de
  **WhatsApp**, e **Acomp de Ligações** (grade semanal "Acomp Kyro").
- **Gerente** → cadastro/edição de corretores (perfil + equipe), gera link de
  acesso da equipe, e Dashboard de desempenho por corretor (leads, ligações,
  agendamentos, vendas).
- **Secretaria/Diretoria** → cadastro de imóveis com filtros (Revenda,
  Lançamento, Casa em condomínio, Casa de rua, Lote em condomínio, Lote de rua,
  Apartamento) e Dashboard geral.

## Setup
1. Crie projeto em https://supabase.com
2. SQL Editor → cole `supabase-setup.sql` → Run (cria tabelas + trigger de perfil)
3. Project Settings → API → copie URL + anon key para `config.js`
4. `DEMO_MODE: true` = teste rápido (sem login). `false` = uso em equipe (login)
5. Suba os arquivos na Vercel (sem build).

## Arquivos
```
crm-kyro/
├── index.html          telas (login + app com sidebar por perfil)
├── styles.css          visual preto/dourado/branco
├── config.js           COLE URL + chave do Supabase
├── app.js              lógica (auth, roles, CRUD, agenda, acomp, dashboard)
├── supabase-setup.sql  tabelas + trigger de perfil + RLS
├── banner-1.jpg        logo da Kyro
└── README.md
```

## Extras incluídos
- **Exportar CSV**: botão ⬇ CSV em Leads e Imóveis (baixa planilha para o Excel).
- **Fotos do imóvel**: upload real para o bucket `fotos` do Supabase Storage
  (criado automaticamente pelo `supabase-setup.sql`); miniatura na tabela.
- **Notificação do navegador**: ao abrir a Agenda, se houver agendamentos
  vencidos e o usuário permitiu notificações, dispara um alerta do sistema.
- Tema preto/dourado/branco com o logo `banner-1.jpg`.

## Observações
- O "organograma de cadastro" está no formulário estruturado do lead (corretor
  define temperatura, nicho, valor e status de venda).
- O alerta da Agenda avisa quantos agendamentos já passaram e precisam de ligação.
- O upload de fotos só funciona com `DEMO_MODE: false` (precisa de usuário
  autenticado para gravar no Storage).
- Em produção, restrinja as políticas RLS por `corretor_id` (veja comentário no
  SQL) e nunca exponha a chave `service_role` no front.
