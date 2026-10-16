-- 20261016000049_board_rich_text.sql — 묶음 16 (의뢰인 2026-10-16: 사내 자유 게시판 + 사진 첨부 · 끌어다 놓기 · 간단한 편집, 공지 · 업무 메시지에도 같은 편집)
-- 1) board_posts: 게시판 글. 본문은 거른 HTML(body_html)과 검색 · 알림용 글자만(body) 둘 다 둔다. 지우면 deleted_at만 찍는다(되살릴 수 있게)
-- 2) content_images: 글에 넣은 사진. 파일은 비공개 저장소(content 버킷)에 두고, 로그인한 사람만 앱을 거쳐(/api/images/…) 본다
-- 3) notices · work_messages에 body_html 칸 — 비어 있으면 예전처럼 글자(body)로 보인다
-- 4) 저장소 content 버킷(비공개, 사진만, 10MB까지)
-- 앱 서버(관리자 열쇠)만 읽고 쓴다 — 화면 쪽 로그인 열쇠로는 읽을 수 없다.
-- 되돌리기: drop table public.board_posts; drop table public.content_images; alter table public.notices drop column body_html; alter table public.work_messages drop column body_html; delete from storage.buckets where id = 'content';

create table public.board_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id),
  title text not null check (char_length(title) between 1 and 200),
  body text not null default '' check (char_length(body) <= 20000),
  body_html text not null default '' check (char_length(body_html) <= 200000),
  is_test boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id),
  check ((deleted_at is null) = (deleted_by is null))
);
create index board_posts_list on public.board_posts (is_test, created_at desc) where deleted_at is null;
create index on public.board_posts (author_id);
alter table public.board_posts enable row level security;
revoke all on public.board_posts from anon, authenticated;

create table public.content_images (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  storage_path text not null unique check (char_length(storage_path) <= 300),
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  bytes int not null check (bytes > 0 and bytes <= 10485760),
  kind text not null check (kind in ('board', 'notice', 'message')),
  created_at timestamptz not null default now()
);
create index on public.content_images (owner_id);
alter table public.content_images enable row level security;
revoke all on public.content_images from anon, authenticated;

alter table public.notices add column body_html text check (body_html is null or char_length(body_html) <= 200000);
alter table public.work_messages add column body_html text check (body_html is null or char_length(body_html) <= 200000);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('content', 'content', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;
