-- Gestão de Manutenção: esquema mínimo seguro para GitHub Pages + Supabase.
-- Execute no SQL Editor do Supabase. Este modelo partilha um documento JSON entre
-- membros autorizados; RLS controla o acesso no servidor, não apenas na interface.

create table if not exists public.app_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now()
);

alter table public.app_members enable row level security;
revoke all on table public.app_members from anon, authenticated;
grant select on table public.app_members to authenticated;
drop policy if exists "members can view their own membership" on public.app_members;
create policy "members can view their own membership"
  on public.app_members for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.is_app_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_members m
    where m.user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_app_member() from public, anon;
grant execute on function public.is_app_member() to authenticated;

create table if not exists public.maintenance_state (
  id text primary key check (id = 'shared'),
  payload jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.maintenance_state enable row level security;
revoke all on table public.maintenance_state from anon, authenticated;
grant select, insert, update on table public.maintenance_state to authenticated;
drop policy if exists "authorized members can read maintenance state" on public.maintenance_state;
drop policy if exists "authorized members can insert maintenance state" on public.maintenance_state;
drop policy if exists "authorized members can update maintenance state" on public.maintenance_state;
create policy "authorized members can read maintenance state"
  on public.maintenance_state for select to authenticated
  using (id = 'shared' and (select public.is_app_member()));
create policy "authorized members can insert maintenance state"
  on public.maintenance_state for insert to authenticated
  with check (id = 'shared' and (select public.is_app_member()) and updated_by = (select auth.uid()));
create policy "authorized members can update maintenance state"
  on public.maintenance_state for update to authenticated
  using (id = 'shared' and (select public.is_app_member()))
  with check (id = 'shared' and (select public.is_app_member()) and updated_by = (select auth.uid()));

-- Bucket privado: não é possível descarregar documentos anonimamente.
insert into storage.buckets (id, name, public, file_size_limit)
values ('maintenance-documents', 'maintenance-documents', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = 26214400;
revoke all on storage.objects from anon;
grant select, insert, update, delete on storage.objects to authenticated;
drop policy if exists "authorized members can read maintenance documents" on storage.objects;
drop policy if exists "authorized members can upload maintenance documents" on storage.objects;
drop policy if exists "authorized members can update maintenance documents" on storage.objects;
drop policy if exists "authorized members can delete maintenance documents" on storage.objects;
create policy "authorized members can read maintenance documents"
  on storage.objects for select to authenticated
  using (bucket_id = 'maintenance-documents' and (select public.is_app_member()));
create policy "authorized members can upload maintenance documents"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'maintenance-documents' and (select public.is_app_member()));
create policy "authorized members can update maintenance documents"
  on storage.objects for update to authenticated
  using (bucket_id = 'maintenance-documents' and (select public.is_app_member()))
  with check (bucket_id = 'maintenance-documents' and (select public.is_app_member()));
create policy "authorized members can delete maintenance documents"
  on storage.objects for delete to authenticated
  using (bucket_id = 'maintenance-documents' and (select public.is_app_member()));

-- Ativar o evento Realtime para a tabela de estado partilhado, quando ainda não estiver publicado.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'maintenance_state'
  ) then
    alter publication supabase_realtime add table public.maintenance_state;
  end if;
exception when undefined_object then
  raise notice 'Publicação supabase_realtime não encontrada; ative Realtime para maintenance_state no Dashboard.';
end $$;

-- IMPORTANTE: não há INSERT/UPDATE/DELETE concedido aos membros em app_members.
-- Adicione cada conta apenas depois de a criar/convidar em Authentication > Users:
-- insert into public.app_members(user_id, role) values ('UUID_DO_UTILIZADOR', 'admin');
