alter table posts add column if not exists format text default 'single';
alter table posts add column if not exists carousel jsonb;
alter table posts add column if not exists content_es jsonb;
alter table posts add column if not exists es_status text;
