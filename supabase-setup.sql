-- =========================================================================
--  SETUP DO BANCO (Supabase) — cole isto no SQL Editor do seu projeto
--  (Supabase -> SQL Editor -> New query -> cole e "Run")
-- =========================================================================

-- ---------- Tabelas ----------
create table if not exists public.leads (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  telefone   text not null,
  email      text,
  tipo       text default 'Comprador',
  interesse  text,
  bairro     text,
  status     text default 'Novo',
  obs        text,
  criado_em  timestamptz default now()
);

create table if not exists public.imoveis (
  id        uuid primary key default gen_random_uuid(),
  titulo    text not null,
  tipo      text default 'Casa',
  bairro    text not null,
  valor     numeric default 0,
  status    text default 'Disponível',
  criado_em timestamptz default now()
);

-- ---------- Row Level Security ----------
alter table public.leads   enable row level security;
alter table public.imoveis enable row level security;

-- =========================================================================
--  MODO DEMO (DEMO_MODE = true no config.js)
--  Acesso PÚBLICO: qualquer um pode ler/escrever. Só para testar rápido.
--  ⚠️ NÃO use em produção — seus dados ficam abertos para qualquer pessoa.
-- =========================================================================
drop policy if exists "demo_leads_all"   on public.leads;
drop policy if exists "demo_imoveis_all" on public.imoveis;
create policy "demo_leads_all"
  on public.leads for all
  using (true) with check (true);
create policy "demo_imoveis_all"
  on public.imoveis for all
  using (true) with check (true);

-- =========================================================================
--  MODO COM LOGIN (DEMO_MODE = false no config.js) — USO REAL EM EQUIPE
--  Comente/acima estão as políticas de demo. Para usar login:
--    1) Remova as políticas de demo (rode os "drop policy" abaixo)
--    2) Habilite as políticas de "auth" abaixo
--    3) No Supabase: Authentication > Providers > Email = ligado
--       (opcional: desligue "Confirm email" para testar sem confirmar)
-- =========================================================================
-- drop policy if exists "demo_leads_all"   on public.leads;
-- drop policy if exists "demo_imoveis_all" on public.imoveis;
--
-- create policy "auth_leads_all"
--   on public.leads for all
--   to authenticated
--   using (true) with check (true);
-- create policy "auth_imoveis_all"
--   on public.imoveis for all
--   to authenticated
--   using (true) with check (true);
