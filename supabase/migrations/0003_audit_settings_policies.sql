-- audit_log: upsert (insert ... on conflict) exige política de update também.
drop policy if exists audit_read on public.audit_log;
drop policy if exists audit_ins on public.audit_log;
create policy audit_rw on public.audit_log for all using (workspace_id = my_workspace()) with check (workspace_id = my_workspace());
-- settings: qualquer editor pode gravar preferências do workspace (admin continua único a mudar brand_rules e prompts).
drop policy if exists settings_admin on public.settings;
create policy settings_rw on public.settings for all using (workspace_id = my_workspace()) with check (workspace_id = my_workspace());
