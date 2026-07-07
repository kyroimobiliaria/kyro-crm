# CRM Imobiliário — versão Supabase (dados reais e compartilhados)

Esta versão usa **Supabase** (Postgres na nuvem, grátis) como banco de dados.
Assim, qualquer corretor que logar vê os **mesmos** leads e imóveis — diferente
da versão `localStorage`, que só salvava no navegador de quem acessava.

É um site estático: sobe na Vercel sem build, igual à versão anterior.

## Passo a passo

### 1. Crie o projeto no Supabase
- Acesse https://supabase.com e crie um projeto (plano gratuito).
- Vai demorar ~1 minuto pra ficar pronto.

### 2. Crie as tabelas e permissões
- No menu esquerdo, abra **SQL Editor → New query**.
- Cole o conteúdo de `supabase-setup.sql` e clique em **Run**.
- Isso cria as tabelas `leads` e `imoveis` e libera o acesso.

### 3. Pegue as credenciais
- Vá em **Project Settings → API**.
- Copie a **Project URL** e a chave **anon public**.
- Cole no `config.js`:

```js
const CONFIG = {
  SUPABASE_URL: 'https://SEU-PROJETO.supabase.co',
  SUPABASE_ANON_KEY: 'sua-chave-anon-aqui',
  DEMO_MODE: true,   // true = teste rápido sem login
};
```

### 4. Teste rápido (modo demo)
Deixe `DEMO_MODE: true`. É só abrir o `index.html` (ou subir pra Vercel) e
cadastrar. Os dados já vão pro banco e aparecem pra qualquer pessoa.

> ⚠️ O modo demo deixa o banco **aberto para qualquer um** (sem login). Use só
> para testar. Para uso real, siga o passo 5.

### 5. Uso real em equipe (com login)
- No `config.js`, mude para `DEMO_MODE: false`.
- No `supabase-setup.sql`, **comente as políticas de demo** e **descomente as
  de `auth`** (há instruções dentro do arquivo). Rode novamente.
- No Supabase: **Authentication → Providers → Email** deve estar ligado.
  (Opcional: desligue "Confirm email" para testar sem confirmar e-mail.)
- Suba pra Vercel. Cada corretor clica em **Criar conta**, faz login e passa
  a ver os mesmos dados.

## Como publicar na Vercel
1. Jogue estes arquivos na raiz do repositório: `index.html`, `styles.css`,
   `config.js`, `app-supabase.js`.
2. Conecte o repo na Vercel (sem configuração de build).
3. Pronto.

## Estrutura
```
crm-supabase/
├── index.html          → telas + tela de login
├── styles.css          → visual
├── config.js           → COLE AQUI sua URL e chave do Supabase
├── app-supabase.js     → lógica (CRUD via Supabase)
├── supabase-setup.sql  → cria tabelas e permissões
└── README.md           → este arquivo
```

## Segurança (importante)
- A chave `anon` é pública por design e segura **porque** a RLS (Row Level
  Security) controla o acesso. Nunca exponha a chave `service_role` no front.
- Antes de expor pra clientes reais, use o modo com login (passo 5) e considere
  políticas mais granulares (ex.: cada corretor só vê seus próprios leads).
