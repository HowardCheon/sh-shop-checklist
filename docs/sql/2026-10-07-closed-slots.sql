-- 관리자 휴무시간 (2026-10-07) — 날짜별 30분 칸, 고객 화면에는 '마감'으로만 보임
create table if not exists sh_shop_closed_slots (
  id bigint generated always as identity primary key,
  date date not null,
  time text not null check (time ~ '^([01][0-9]|2[0-3]):(00|30)$'),
  created_at timestamptz not null default now(),
  unique (date, time)
);
alter table sh_shop_closed_slots enable row level security;
