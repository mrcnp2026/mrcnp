-- 20261002000008_notices.sql
-- 공지 팝업 (②-5 7-15, 게이트 15 — 의뢰인 요청으로 ② 전에 글 공지 먼저. 사진은 다음 단계).
-- 되돌리는 방법: drop table notice_reads, notice_translations, notice_targets, notices; — ⚠️ 공지·확인 기록이 사라진다.
--
-- 규칙: 쓰기는 서버 API만 (브라우저 쓰기 권한 없음). 공지는 지우지 않는다(보관만, ②-0 4-13). 확인 기록은 덧붙이기만.

create table public.notices (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 120),   -- 한국어 원문 (법적 원본, ① 4-10)
  body        text not null check (char_length(body) between 1 and 4000),   -- 일반 텍스트. HTML로 해석하지 않는다 (B-32)
  important   boolean not null default false,   -- 먼저 보이고 "오늘 하루 보지 않기" 없음
  legal       boolean not null default false,   -- 법적·급여 관련: 켜진 언어 번역을 전부 확인해야 게시 (B-37)
  audience    text not null default 'all' check (audience in ('all', 'selected')),
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz,                      -- null = 보관할 때까지
  status      text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  version     int not null default 1,           -- "내용 변경"이면 +1 → 모두 다시 확인 (B-38)
  created_by  uuid not null references public.profiles(id),
  updated_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);

create table public.notice_targets (
  notice_id   uuid not null references public.notices(id),
  employee_id uuid not null references public.profiles(id),
  primary key (notice_id, employee_id)
);

create table public.notice_translations (
  notice_id        uuid not null references public.notices(id),
  locale           text not null check (locale in ('en', 'vi', 'th')),
  title            text not null,
  body             text not null,
  source           text not null check (source in ('machine', 'human')),
  reviewed         boolean not null default false,   -- 관리자가 「확인했음」
  numbers_ok       boolean not null default true,    -- 원문 숫자가 그대로 있는가 (숫자 대조)
  based_on_version int not null,
  updated_at       timestamptz not null default now(),
  primary key (notice_id, locale)
);

create table public.notice_reads (
  id           uuid primary key default gen_random_uuid(),
  notice_id    uuid not null references public.notices(id),
  employee_id  uuid not null references public.profiles(id),
  version      int not null,
  shown_locale text not null,         -- 어느 언어로 보여 줬나 (② 13장: 이해 여부 다툼 대비)
  read_at      timestamptz not null default now(),
  unique (notice_id, employee_id, version)
);
create index on public.notice_reads (employee_id);

alter table public.notices             enable row level security;
alter table public.notice_targets      enable row level security;
alter table public.notice_translations enable row level security;
alter table public.notice_reads        enable row level security;
revoke all on public.notices, public.notice_targets, public.notice_translations, public.notice_reads from anon, authenticated;

-- 지우지 않는다 (보관만). 확인 기록은 고치지도 않는다
create trigger notices_no_delete      before delete on public.notices      for each row execute function public.guard_columns(
  'title','body','important','legal','audience','starts_at','ends_at','status','version','updated_by','updated_at');
create trigger notice_reads_no_update before update on public.notice_reads for each row execute function public.forbid_change();
create trigger notice_reads_no_delete before delete on public.notice_reads for each row execute function public.forbid_change();
