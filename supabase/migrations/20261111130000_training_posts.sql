create table if not exists public.training_posts (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  source_row integer not null check (source_row >= 3),
  submitted_at timestamptz not null,
  client text not null,
  city text not null default '',
  topic text not null default '',
  market text not null default 'br' check (market in ('br','latam','review')),
  status text not null default 'processing' check (status in ('processing','review','needs_photo','discarded')),
  draft jsonb not null default '{}'::jsonb check (jsonb_typeof(draft) = 'object'),
  revision integer not null default 0,
  notified_at timestamptz
);

create table if not exists public.training_assets (
  post_id uuid not null references public.training_posts(id) on delete cascade,
  asset_key text not null,
  kind text not null check (kind in ('photo','logo')),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  bytes bytea not null check (octet_length(bytes) between 1 and 6291456),
  note text not null default '',
  rank smallint not null default 0,
  primary key (post_id, asset_key)
);

create table if not exists public.training_publications (
  post_id uuid not null references public.training_posts(id) on delete cascade,
  destination text not null check (destination in ('br_ig','br_li','latam_ig','latam_li')),
  requested_at timestamptz not null default now(),
  scheduled_for timestamptz not null,
  approved_by uuid not null default auth.uid(),
  status text not null default 'sending' check (status in ('sending','scheduled','verify')),
  remote_id text,
  primary key (post_id, destination)
);

alter table public.training_posts enable row level security;
alter table public.training_assets enable row level security;
alter table public.training_publications enable row level security;

revoke all on public.training_posts, public.training_assets, public.training_publications from public, anon, authenticated;
grant select, update (draft, status, market, revision) on public.training_posts to authenticated;
grant select, insert on public.training_assets to authenticated;
grant select, insert, update (status, remote_id) on public.training_publications to authenticated;
grant all on public.training_posts, public.training_assets, public.training_publications to service_role;

create policy training_posts_admin on public.training_posts for all to authenticated
  using (public.my_workspace() = 'ws_vendamais' and public.my_role() = 'admin' and status <> 'processing')
  with check (public.my_workspace() = 'ws_vendamais' and public.my_role() = 'admin' and status <> 'processing');

create policy training_assets_admin on public.training_assets for all to authenticated
  using (exists (select 1 from public.training_posts where id = post_id))
  with check (exists (select 1 from public.training_posts where id = post_id));

create policy training_publications_admin on public.training_publications for all to authenticated
  using (public.my_workspace() = 'ws_vendamais' and public.my_role() = 'admin')
  with check (public.my_workspace() = 'ws_vendamais' and public.my_role() = 'admin' and approved_by = (select auth.uid()));

create or replace function public.claim_training_publication(
  training_id uuid, expected_revision integer, target text, publish_at timestamptz
) returns boolean
language plpgsql security invoker set search_path = ''
as $$
declare item public.training_posts%rowtype;
begin
  select * into item from public.training_posts
    where id = training_id and revision = expected_revision and status = 'review' for update;
  if not found or publish_at <= now() or item.market = 'review' then return false; end if;
  if target not in ('br_ig','br_li','latam_ig','latam_li') then return false; end if;
  if target like 'latam_%' and item.market <> 'latam' then return false; end if;
  insert into public.training_publications (post_id, destination, scheduled_for)
    values (training_id, target, publish_at) on conflict do nothing;
  return found;
end;
$$;

revoke all on function public.claim_training_publication(uuid, integer, text, timestamptz) from public, anon;
grant execute on function public.claim_training_publication(uuid, integer, text, timestamptz) to authenticated;

create or replace function public.guard_training_edit()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if (new.draft, new.market, new.status, new.revision) is distinct from (old.draft, old.market, old.status, old.revision)
     and exists (select 1 from public.training_publications where post_id = old.id) then
    raise exception 'Esta postagem já tem um agendamento iniciado.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_training_edit() from public, anon, authenticated;
create trigger guard_training_edit before update on public.training_posts
  for each row execute function public.guard_training_edit();
