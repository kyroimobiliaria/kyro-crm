-- =========================================================================
--  CRM KYRO — setup do banco (Supabase SQL Editor -> Run)
-- =========================================================================

-- ---------- Perfis de usuários (corretor / gerente / secretaria / diretoria)
create table if not exists public.profiles (
  id       uuid primary key references auth.users(id) on delete cascade,
  nome     text,
  email    text,
  role     text default 'corretor',   -- corretor | gerente | secretaria | diretoria
  equipe   text,
  criado_em timestamptz default now()
);

-- Trigger: cria o profile automaticamente quando o usuário se cadastra
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, nome, role)
  values (new.id, new.email, split_part(new.email, '@', 1), 'corretor');
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------- Leads (cadastro do corretor)
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  corretor_id uuid references public.profiles(id) on delete set null,
  nome text not null,
  telefone text,
  email text,
  tipo text,
  nicho text,
  temperatura text default 'morno',
  valor_imovel numeric default 0,
  status text default 'Novo',
  etiquetas text,
  anotacoes text,
  interesse text,
  bairro text,
  agendamento timestamptz,
  agendamento_obs text,
  criado_em timestamptz default now()
);

-- ---------- Ligações (grade "Acomp Kyro")
create table if not exists public.ligacoes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  corretor_id uuid references public.profiles(id) on delete set null,
  data date,
  criado_em timestamptz default now()
);

-- ---------- Imóveis (secretaria/diretoria) + foto
create table if not exists public.imoveis (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  tipo text,
  bairro text,
  valor numeric default 0,
  status text default 'Disponível',
  foto_url text,
  criado_em timestamptz default now()
);

-- ---------- Bucket de fotos (público) ----------
insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', true)
on conflict (id) do nothing;

-- ---------- Row Level Security (modo com login) ----------
alter table public.profiles enable row level security;
alter table public.leads    enable row level security;
alter table public.ligacoes enable row level security;
alter table public.imoveis  enable row level security;

-- MODO DEMO (DEMO_MODE = true no config.js): acesso público, só p/ teste
drop policy if exists "demo_all_profiles" on public.profiles;
drop policy if exists "demo_all_leads"    on public.leads;
drop policy if exists "demo_all_ligacoes" on public.ligacoes;
drop policy if exists "demo_all_imoveis"  on public.imoveis;
create policy "demo_all_profiles" on public.profiles for all using (true) with check (true);
create policy "demo_all_leads"    on public.leads    for all using (true) with check (true);
create policy "demo_all_ligacoes" on public.ligacoes for all using (true) with check (true);
create policy "demo_all_imoveis"  on public.imoveis  for all using (true) with check (true);
drop policy if exists "fotos_rw" on storage.objects;
create policy "fotos_rw" on storage.objects for all using (bucket_id = 'fotos') with check (bucket_id = 'fotos');

-- MODO COM LOGIN (DEMO_MODE = false): autenticados têm acesso (controle de
-- papéis fica no app). Para produção, restrinja por corretor_id.
-- drop policy if exists "demo_all_profiles" on public.profiles;
-- drop policy if exists "demo_all_leads"    on public.leads;
-- drop policy if exists "demo_all_ligacoes" on public.ligacoes;
-- drop policy if exists "demo_all_imoveis"  on public.imoveis;
-- drop policy if exists "fotos_rw" on storage.objects;
-- create policy "auth_all" on public.profiles for all to authenticated using (true) with check (true);
-- create policy "auth_all" on public.leads    for all to authenticated using (true) with check (true);
-- create policy "auth_all" on public.ligacoes for all to authenticated using (true) with check (true);
-- create policy "auth_all" on public.imoveis  for all to authenticated using (true) with check (true);
-- create policy "fotos_rw" on storage.objects for all to authenticated using (bucket_id='fotos') with check (bucket_id='fotos');
