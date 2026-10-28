-- Rode no Supabase → SQL Editor (idempotente)
alter table posts add column if not exists format text default 'single';
alter table posts add column if not exists carousel jsonb;
alter table posts add column if not exists content_es jsonb;
alter table posts add column if not exists es_status text;
alter table posts add column if not exists carousel_es jsonb;
alter table posts add column if not exists meme_layout text;
alter table posts add column if not exists alternatives jsonb;
alter table posts add column if not exists format_reason text;
alter table posts drop constraint if exists posts_angle_check;
alter table posts add constraint posts_angle_check check (angle in ('training','consulting','business','meme'));
alter table publications add column if not exists lang text default 'pt';
alter table editions add column if not exists schedule_assignment jsonb;
alter table editions add column if not exists schedule_times jsonb;
alter table editions add column if not exists meme_included boolean default false;
