-- VendaMais Content Engine — schema inicial (Supabase Postgres)
-- Espelha as tabelas da seção 10 do Documento Mestre. RLS: acesso restrito ao workspace do usuário.
create extension if not exists pgcrypto;

create table if not exists workspaces (
  id text primary key,
  name text not null,
  brand_rules_version int not null default 1,
  created_at timestamptz not null default now()
);
create table if not exists users (
  id uuid primary key references auth.users(id) on delete cascade,
  workspace_id text not null references workspaces(id),
  role text not null default 'editor' check (role in ('admin','editor','viewer')),
  name text, email text,
  created_at timestamptz not null default now()
);
create table if not exists brand_assets (
  id text primary key, workspace_id text not null references workspaces(id),
  type text not null, label text, partner_id text, file_url text, version int not null default 1,
  active boolean not null default true, metadata jsonb default '{}'::jsonb, created_at timestamptz default now()
);
create table if not exists brand_rules (
  id text primary key, workspace_id text not null references workspaces(id),
  version int not null, rules_json jsonb not null, approved_by text, approved_at timestamptz, active boolean default false
);
create table if not exists editions (
  id text primary key, workspace_id text not null references workspaces(id),
  title text, theme text, audience text, objective text, status text not null default 'draft',
  edition_date date, brief jsonb default '{}'::jsonb, exports jsonb default '{}'::jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists sources (
  id text primary key, edition_id text not null references editions(id) on delete cascade,
  type text not null, name text, url text, file_name text, "primary" boolean default false,
  extracted_text text, hash text, created_at timestamptz default now()
);
create table if not exists analyses (
  id text primary key, edition_id text not null references editions(id) on delete cascade,
  summary text, facts jsonb default '[]'::jsonb, risks jsonb default '[]'::jsonb, angles jsonb default '[]'::jsonb,
  provider text, created_at timestamptz default now()
);
create table if not exists newsletter_versions (
  id text primary key, edition_id text not null references editions(id) on delete cascade,
  n int not null, content_json jsonb not null, meta jsonb default '{}'::jsonb, html text, plain text,
  score int, qa_json jsonb, is_approved boolean default false, origin text, note text, provider text,
  approved_at timestamptz, created_at timestamptz default now()
);
create table if not exists posts (
  id text primary key, edition_id text not null references editions(id) on delete cascade,
  angle text not null check (angle in ('training','consulting','business')),
  content_json jsonb not null, template_id text, image_id text, crop jsonb, partner_id text,
  status text default 'draft', score int, qa_json jsonb, origin text, meta jsonb default '{}'::jsonb,
  versions jsonb default '[]'::jsonb, approved_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now(),
  unique (edition_id, angle)
);
create table if not exists generated_images (
  id text primary key, post_id text not null references posts(id) on delete cascade, edition_id text,
  source text, provider text, model text, mode text, prompt text, file_url text, cost_meta jsonb, ms int, created_at timestamptz default now()
);
create table if not exists renders (
  id text primary key, post_id text not null references posts(id) on delete cascade,
  template_id text, image_id text, image_url text, render_url text, dimensions text default '1080x1350', created_at timestamptz default now()
);
create table if not exists publications (
  id text primary key, post_id text not null references posts(id) on delete cascade, edition_id text,
  provider text default 'metricool', networks jsonb default '[]'::jsonb, date_time text, timezone text, draft boolean default false,
  media_urls jsonb default '[]'::jsonb, remote jsonb, status text default 'scheduled', created_at timestamptz default now()
);
create table if not exists prompt_templates (
  id text primary key, workspace_id text not null references workspaces(id),
  name text, version int not null default 1, prompt_text text not null, active boolean default true, custom boolean default false
);
create table if not exists audit_log (
  id text primary key, workspace_id text references workspaces(id), user_id text, user_name text,
  action text not null, entity text, entity_id text, metadata jsonb default '{}'::jsonb, created_at timestamptz default now()
);
create table if not exists settings (
  workspace_id text primary key references workspaces(id), settings_json jsonb not null default '{}'::jsonb, updated_at timestamptz default now()
);

-- Workspace único do MVP
insert into workspaces (id, name) values ('ws_vendamais', 'VendaMais') on conflict do nothing;

-- Vincula automaticamente novos usuários autenticados ao workspace VendaMais (primeiro usuário = admin)
create or replace function public.handle_new_user() returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, workspace_id, role, name, email)
  values (new.id, 'ws_vendamais', case when (select count(*) from public.users) = 0 then 'admin' else 'editor' end, new.raw_user_meta_data->>'name', new.email)
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

-- RLS
create or replace function public.my_workspace() returns text language sql stable as $$ select workspace_id from public.users where id = auth.uid() $$;
create or replace function public.my_role() returns text language sql stable as $$ select role from public.users where id = auth.uid() $$;

do $$ declare t text; begin
  foreach t in array array['workspaces','users','brand_assets','brand_rules','editions','prompt_templates','audit_log','settings'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
  foreach t in array array['sources','analyses','newsletter_versions','posts'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
  alter table generated_images enable row level security; alter table renders enable row level security; alter table publications enable row level security;
end $$;

create policy ws_read on workspaces for select using (id = my_workspace());
create policy users_read on users for select using (workspace_id = my_workspace());
create policy users_admin on users for update using (my_role() = 'admin');
create policy ba_rw on brand_assets for all using (workspace_id = my_workspace()) with check (workspace_id = my_workspace() and my_role() in ('admin','editor'));
create policy br_read on brand_rules for select using (workspace_id = my_workspace());
create policy br_admin on brand_rules for insert with check (workspace_id = my_workspace() and my_role() = 'admin');
create policy br_admin_u on brand_rules for update using (workspace_id = my_workspace() and my_role() = 'admin');
create policy ed_rw on editions for all using (workspace_id = my_workspace()) with check (workspace_id = my_workspace() and my_role() in ('admin','editor'));
create policy src_rw on sources for all using (exists (select 1 from editions e where e.id = edition_id and e.workspace_id = my_workspace())) with check (my_role() in ('admin','editor'));
create policy an_rw on analyses for all using (exists (select 1 from editions e where e.id = edition_id and e.workspace_id = my_workspace())) with check (my_role() in ('admin','editor'));
create policy nlv_rw on newsletter_versions for all using (exists (select 1 from editions e where e.id = edition_id and e.workspace_id = my_workspace())) with check (my_role() in ('admin','editor'));
create policy posts_rw on posts for all using (exists (select 1 from editions e where e.id = edition_id and e.workspace_id = my_workspace())) with check (my_role() in ('admin','editor'));
create policy gi_rw on generated_images for all using (exists (select 1 from posts p join editions e on e.id = p.edition_id where p.id = post_id and e.workspace_id = my_workspace())) with check (my_role() in ('admin','editor'));
create policy rd_rw on renders for all using (exists (select 1 from posts p join editions e on e.id = p.edition_id where p.id = post_id and e.workspace_id = my_workspace())) with check (my_role() in ('admin','editor'));
create policy pub_rw on publications for all using (exists (select 1 from posts p join editions e on e.id = p.edition_id where p.id = post_id and e.workspace_id = my_workspace())) with check (my_role() in ('admin','editor'));
create policy pt_read on prompt_templates for select using (workspace_id = my_workspace());
create policy pt_admin on prompt_templates for all using (workspace_id = my_workspace() and my_role() = 'admin') with check (workspace_id = my_workspace() and my_role() = 'admin');
create policy audit_read on audit_log for select using (workspace_id = my_workspace());
create policy audit_ins on audit_log for insert with check (workspace_id = my_workspace());
create policy settings_read on settings for select using (workspace_id = my_workspace());
create policy settings_admin on settings for all using (workspace_id = my_workspace() and my_role() = 'admin') with check (workspace_id = my_workspace() and my_role() = 'admin');

-- Storage: buckets para ativos de marca, imagens-base, renders e exports
insert into storage.buckets (id, name, public) values ('brand', 'brand', true) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('images', 'images', false) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('renders', 'renders', false) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('exports', 'exports', false) on conflict do nothing;
create policy "brand public read" on storage.objects for select using (bucket_id = 'brand');
create policy "authenticated write brand" on storage.objects for insert with check (bucket_id = 'brand' and auth.role() = 'authenticated');
create policy "authenticated rw private buckets" on storage.objects for all using (bucket_id in ('images','renders','exports') and auth.role() = 'authenticated') with check (bucket_id in ('images','renders','exports') and auth.role() = 'authenticated');
