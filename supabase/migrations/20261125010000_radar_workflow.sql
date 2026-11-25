-- The Radar uses existing editions, versions, posts, images and publication records.
-- Only editions created through this workflow are guarded against legacy whole-workspace writes.
create or replace function public.radar_protect() returns trigger
language plpgsql set search_path = public as $$
declare target text;
begin
  if tg_table_name = 'editions' then target := old.id;
  else target := old.edition_id;
  end if;
  if current_user in ('anon', 'authenticated')
    and exists (select 1 from editions where id = target and brief->>'radar_workflow' = 'true')
  then raise exception 'Abra esta edição no novo VM Estúdio.' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.radar_protect_insert() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated') and exists (
    select 1 from editions where id = new.edition_id and brief->>'radar_workflow' = 'true'
  ) then raise exception 'Abra esta edição no novo VM Estúdio.' using errcode = '42501';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['editions','newsletter_versions','posts','generated_images','publications'] loop
    execute format('drop trigger if exists radar_protect on public.%I', t);
    execute format(
      'create trigger radar_protect before update or delete on public.%I for each row execute function public.radar_protect()', t
    );
    if t <> 'editions' then
      execute format('drop trigger if exists radar_protect_insert on public.%I', t);
      execute format(
        'create trigger radar_protect_insert before insert on public.%I for each row execute function public.radar_protect_insert()', t
      );
    end if;
  end loop;
end;
$$;

create or replace function public.radar_change(action text, edition_id text default null, input jsonb default '{}'::jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  ws text := public.my_workspace();
  editor text := public.my_role();
  ed public.editions%rowtype;
  nl public.newsletter_versions%rowtype;
  item public.posts%rowtype;
  row_data jsonb;
  language_code text;
  asset jsonb;
  key text;
  result_id text;
  revision_at timestamptz := clock_timestamp();
  message text := btrim(coalesce(input->>'note', ''));
begin
  if ws is null or editor not in ('admin','editor') then
    raise exception 'Sua conta não tem acesso para editar esta edição.' using errcode = '42501';
  end if;

  if action = 'import' then
    if coalesce(input->>'number','') !~ '^[1-9][0-9]{0,5}$'
      or length(coalesce(input#>>'{content,headline}','')) not between 5 and 300
      or length(coalesce(input->>'source','')) not between 60 and 100000 then
      raise exception 'Informe o número, o título e o texto completo da newsletter.';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(ws, 0));
    select * into ed from editions e where e.workspace_id = ws and e.brief->>'number' = input->>'number' limit 1 for update;
    if found then
      if ed.brief->>'radar_workflow' is distinct from 'true'
        or exists (select 1 from newsletter_versions v where v.edition_id = ed.id and v.is_approved)
      then raise exception 'Já existe uma edição com esse número. Abra a edição registrada.'; end if;
      select * into nl from newsletter_versions v where v.edition_id = ed.id order by v.n desc limit 1;
      if nl.meta->>'radar_source' = input->>'source' then return ed.id; end if;
      if nl.id is distinct from input->>'expected_version' then
        raise exception 'A newsletter mudou. Abra a versão atual antes de editar.';
      end if;
      update editions set title = input#>>'{content,headline}',
        edition_date = coalesce((input->>'date')::date, ed.edition_date), updated_at = revision_at
        where id = ed.id;
    else
      if input ? 'expected_version' then raise exception 'A edição não foi encontrada.'; end if;
      ed.id := 'ed_radar_' || gen_random_uuid()::text;
      insert into editions(id,workspace_id,title,status,edition_date,brief)
      values(ed.id,ws,input#>>'{content,headline}','newsletter_generated',(input->>'date')::date,
        jsonb_build_object('number',(input->>'number')::integer,'radar_workflow',true));
    end if;
    insert into newsletter_versions(id,edition_id,n,content_json,meta,origin)
      values('nl_' || gen_random_uuid()::text,ed.id,coalesce(nl.n,0)+1,input->'content',
        jsonb_build_object('radar_source',input->>'source','radar_state','review'),'human');
    result_id := ed.id;
  else
    select * into ed from editions e where e.id = radar_change.edition_id and e.workspace_id = ws for update;
    if not found or ed.brief->>'radar_workflow' is distinct from 'true' then
      raise exception 'Esta edição faz parte do histórico. Abra uma nova edição para editar.';
    end if;
    result_id := ed.id;
    if action in ('approve_newsletter','request_newsletter') then
      select * into nl from newsletter_versions v where v.edition_id = ed.id order by v.is_approved desc nulls last, v.n desc limit 1 for update;
      if nl.id is distinct from input->>'version_id' or nl.is_approved then
        raise exception 'Esta newsletter já foi aprovada ou tem uma versão mais recente.';
      end if;
      if action = 'approve_newsletter' then
        if length(coalesce(input->>'html','')) not between 100 and 250000
          or length(coalesce(input->>'plain','')) < 60 then raise exception 'A prévia da newsletter está incompleta.'; end if;
        if coalesce(nl.meta->>'radar_state','') = 'changes' then
          raise exception 'Salve a newsletter revisada antes de aprovar.';
        end if;
        update newsletter_versions set is_approved = true, approved_at = revision_at, html = input->>'html', plain = input->>'plain'
          where id = nl.id;
        update editions set status = 'newsletter_approved', updated_at = revision_at where id = ed.id;
      else
        if length(message) not between 2 and 2000 then raise exception 'Descreva o ajuste que você quer.'; end if;
        update newsletter_versions set meta = meta || jsonb_build_object('radar_state','changes','radar_note',message) where id = nl.id;
      end if;
    elsif action = 'prepare_posts' then
      if not exists (select 1 from newsletter_versions v where v.edition_id = ed.id and v.is_approved)
        then raise exception 'Aprove a newsletter para preparar os posts.'; end if;
      for row_data in select value from jsonb_array_elements(input->'posts') loop
        if row_data->>'angle' not in ('consulting','training','business')
          or length(coalesce(row_data#>>'{content,headline}','')) not between 3 and 300 then
          raise exception 'Um dos posts veio incompleto.';
        end if;
        insert into posts(id,edition_id,angle,content_json,origin,status,format)
        values('post_' || gen_random_uuid()::text,ed.id,row_data->>'angle',row_data->'content',
          coalesce(row_data->>'origin','human'),'draft','single')
        on conflict on constraint posts_edition_id_angle_key do nothing;
      end loop;
      update editions set status = 'posts_generated', updated_at = revision_at
        where id = ed.id and status = 'newsletter_approved';
    elsif action in ('edit_caption','set_art','approve_pt','approve_post','request_post') then
      select * into item from posts p where p.id = input->>'post_id' and p.edition_id = ed.id for update;
      if not found or item.status in ('approved','exported') or exists (
        select 1 from publications p where p.post_id = item.id and p.status <> 'cancelled'
      ) then raise exception 'Esta peça já foi aprovada ou mudou de estado.'; end if;
      if item.updated_at is distinct from (input->>'expected_at')::timestamptz then
        raise exception 'A peça foi atualizada. Confira a versão mais recente.';
      end if;
      language_code := input->>'lang';
      if action in ('edit_caption','set_art') and (language_code is null or language_code not in ('pt','es')) then
        raise exception 'Escolha português ou espanhol.';
      end if;
      if language_code = 'es' and item.meta->>'radar_pt_approved' is null then
        raise exception 'Aprove a versão em português primeiro.';
      end if;
      if action = 'set_art' then
        asset := input->'art';
        key := asset->>'image_id';
        if coalesce(key,'') !~ '^img_[0-9a-f-]{36}$'
          or asset->>'width' is distinct from '1080' or asset->>'height' is distinct from '1350'
          or asset->>'mime' not in ('image/png','image/jpeg')
          or not exists (select 1 from storage.objects o where o.bucket_id = 'images'
            and o.name = item.id || '/' || key || case when asset->>'mime' = 'image/png' then '.png' else '.jpg' end
            and o.owner_id = auth.uid()::text)
        then raise exception 'Envie um arquivo PNG ou JPG de 1080 × 1350.'; end if;
        insert into generated_images(id,post_id,edition_id,source,provider,file_url,cost_meta)
        values(key,item.id,ed.id,'upload','upload','storage://images/' || item.id || '/' || key ||
          case when asset->>'mime' = 'image/png' then '.png' else '.jpg' end,jsonb_build_object('usage','final_artwork','lang',language_code));
        update posts set meta = meta || jsonb_build_object('artwork_mode','final',
          'final_artworks',coalesce(meta->'final_artworks','{}'::jsonb) || jsonb_build_object(language_code,asset))
          - 'radar_note' - 'radar_changes' - (case when language_code = 'pt' then 'radar_pt_approved' else 'radar_unused' end),
          qa_json = null, score = null, updated_at = revision_at
          where id = item.id;
      elsif action = 'edit_caption' then
        if length(coalesce(input->>'text','')) not between 10 and 2200 then
          raise exception 'A legenda deve ter entre 10 e 2.200 caracteres.';
        end if;
        row_data := jsonb_build_object('body',input->>'text','hashtags','[]'::jsonb);
        update posts set
          content_json = case when language_code = 'pt' then (content_json - 'captions') || jsonb_build_object('caption',row_data) else content_json end,
          content_es = case when language_code = 'es' then (coalesce(content_es,'{}'::jsonb) - 'captions') || jsonb_build_object('caption',row_data) else content_es end,
          meta = meta - 'radar_note' - 'radar_changes' - (case when language_code = 'pt' then 'radar_pt_approved' else 'radar_unused' end),
          qa_json=null,score=null,updated_at=revision_at where id = item.id;
      elsif action = 'request_post' then
        if length(message) not between 2 and 2000 then raise exception 'Descreva o ajuste que você quer.'; end if;
        update posts set meta = meta || jsonb_build_object('radar_note',message,'radar_changes',true),
          updated_at = revision_at where id = item.id;
      else
        foreach language_code in array (case when action = 'approve_pt' then array['pt'] else array['pt','es'] end) loop
          asset := item.meta->'final_artworks'->language_code;
          row_data := case when language_code = 'pt' then item.content_json else item.content_es end;
          if item.meta->>'radar_changes' = 'true' or asset->>'width' is distinct from '1080'
            or asset->>'height' is distinct from '1350'
            or not exists (select 1 from generated_images g where g.id = asset->>'image_id' and g.post_id = item.id and g.file_url is not null)
            or row_data ? 'captions' or length(btrim(concat_ws(' ',row_data#>>'{caption,hook}',row_data#>>'{caption,body}',row_data#>>'{caption,cta}'))) < 10
          then raise exception 'Confira se a legenda, a arte e os ajustes estão prontos.'; end if;
        end loop;
        if action = 'approve_pt' then
          update posts set meta = meta || jsonb_build_object('radar_pt_approved',revision_at),updated_at = revision_at where id = item.id;
        else
          if item.meta->>'radar_pt_approved' is null then raise exception 'Aprove a versão em português primeiro.'; end if;
          update posts set status = 'approved', approved_at = revision_at, es_status = 'validated', updated_at = revision_at where id = item.id;
        end if;
        if (select count(*) from posts p where p.edition_id = ed.id and p.angle <> 'meme' and p.status in ('approved','exported')) = 3
        then update editions set status = 'approved',updated_at = revision_at where id = ed.id; end if;
      end if;
    else
      raise exception 'Ação desconhecida.';
    end if;
  end if;

  insert into audit_log(id,workspace_id,user_id,action,entity,entity_id,metadata)
    values('log_' || gen_random_uuid()::text,ws,auth.uid()::text,'radar.' || action,'edition',result_id,
      jsonb_strip_nulls(jsonb_build_object('post',input->>'post_id','lang',input->>'lang','note',nullif(message,''))));
  return result_id;
end;
$$;

revoke all on function public.radar_change(text,text,jsonb) from public, anon;
grant execute on function public.radar_change(text,text,jsonb) to authenticated;

-- Claim publication work before touching an external service. An uncertain write
-- is reconciled by reading the provider and is never sent twice automatically.
create table if not exists public.radar_publication_intents (
  edition_id text primary key references public.editions(id) on delete restrict,
  workspace_id text not null references public.workspaces(id),
  newsletter_version_id text not null references public.newsletter_versions(id),
  plan jsonb not null,
  approved_by uuid not null,
  approved_at timestamptz not null default now(),
  checkpoints jsonb not null default '{}'::jsonb
);
alter table public.radar_publication_intents enable row level security;
revoke all on public.radar_publication_intents from anon, authenticated;
grant select on public.radar_publication_intents to authenticated;
grant select, insert, update on public.radar_publication_intents to service_role;
drop policy if exists radar_intent_read on public.radar_publication_intents;
create policy radar_intent_read on public.radar_publication_intents for select to authenticated
using (workspace_id = public.my_workspace() and public.my_role() = 'admin');
