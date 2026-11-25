-- Permite o 4º post (Meme da Semana) na tabela posts.
alter table posts drop constraint if exists posts_angle_check;
alter table posts add constraint posts_angle_check check (angle in ('training','consulting','business','meme'));
