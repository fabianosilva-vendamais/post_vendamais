-- Corrige recursão infinita de RLS (erro 54001 stack depth): as funções auxiliares
-- passam a rodar como SECURITY DEFINER, sem disparar as políticas da tabela users.
create or replace function public.my_workspace() returns text
language sql stable security definer set search_path = public as $$
  select workspace_id from public.users where id = auth.uid()
$$;
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.users where id = auth.uid()
$$;
-- users: política sem função recursiva
drop policy if exists users_read on public.users;
drop policy if exists users_admin on public.users;
create policy users_read on public.users for select using (id = auth.uid() or workspace_id = (select workspace_id from public.users u where u.id = auth.uid()));
create policy users_admin on public.users for update using ((select role from public.users u where u.id = auth.uid()) = 'admin');
-- garante que o usuário logado exista em users (caso o trigger não tenha rodado)
insert into public.users (id, workspace_id, role, name, email)
select au.id, 'ws_vendamais', case when (select count(*) from public.users) = 0 then 'admin' else 'editor' end, au.raw_user_meta_data->>'name', au.email
from auth.users au where not exists (select 1 from public.users u where u.id = au.id);
