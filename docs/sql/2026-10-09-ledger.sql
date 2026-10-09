-- 샵 가계부 (2026-10-09) — 지출·기타 수입 직접 입력. 매출은 관리자 앱 결제에서 조회 시 자동 계산
create table if not exists sh_shop_ledger_categories (
  id bigint generated always as identity primary key,
  io text not null check (io in ('in', 'out')),
  name text not null,
  sort integer not null default 0,
  hidden boolean not null default false,
  unique (io, name)
);

create table if not exists sh_shop_ledger_entries (
  id bigint generated always as identity primary key,
  entry_date date not null,
  io text not null check (io in ('in', 'out')),
  amount integer not null check (amount > 0),
  category_id bigint not null references sh_shop_ledger_categories(id),
  method text check (method in ('card', 'cash', 'transfer')),
  evidence text not null default 'unknown' check (evidence in ('card', 'cash_receipt', 'tax_invoice', 'none', 'unknown')),
  vendor text,
  memo text,
  excluded boolean not null default false,
  exclude_reason text,
  legacy_est_no integer unique, -- 옛 가계부(EST_TN_LIST.NO) 추적
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sh_shop_ledger_entries_date_idx on sh_shop_ledger_entries(entry_date);
alter table sh_shop_ledger_categories enable row level security;
alter table sh_shop_ledger_entries enable row level security;

-- 기본 항목
insert into sh_shop_ledger_categories (io, name, sort) values
  ('out', '재료비', 10), ('out', '제품 매입', 20), ('out', '임대료', 30), ('out', '관리비·공과금', 40), ('out', '통신비', 50),
  ('out', '광고·마케팅', 60), ('out', '카드 수수료', 70), ('out', '가구·장비', 80), ('out', '공사비', 90), ('out', '소모품', 100),
  ('out', '세금·보험', 110), ('out', '기타', 900),
  ('in', '시술 매출(수기)', 10), ('in', '제품 판매', 20), ('in', '기타 수입', 900)
on conflict (io, name) do nothing;

-- 옛 가계부(EST) 이전 — 삭제된 기록 제외, 메모로 잘못 분류된 3건 보정, 관리자 앱과 중복된 수기 매출 4건 제외 표시
insert into sh_shop_ledger_entries (entry_date, io, amount, category_id, method, evidence, memo, excluded, exclude_reason, legacy_est_no, created_at)
select
  to_date(t."USE_YMD", 'YYYYMMDD'),
  m.io, t."AMT", c.id,
  case b."BANK_NM" when '카드' then 'card' when '현금' then 'cash' when '계좌이체' then 'transfer' end,
  'unknown',
  nullif(trim(t."MEMO"), ''),
  t."MEMO" in ('정순영 200정액 화장품증정', '국유경 이벤트4회권', '권영아 이벤트4회권', '안성희 2회권'),
  case when t."MEMO" in ('정순영 200정액 화장품증정', '국유경 이벤트4회권', '권영아 이벤트4회권', '안성희 2회권') then '관리자 앱 기록과 중복' end,
  t."NO",
  coalesce(t."INST_DTM", now())
from "EST_TN_LIST" t
left join "EST_TB_WHAT" w on w."NO" = t."WHAT_NO"
left join "EST_TB_BANK" b on b."BANK_CD" = t."BANK_CD"
cross join lateral (
  select
    case t."NO" when 29 then 'out' when 43 then 'out' when 30 then 'in'
      else case t."IO_TYPE" when 'I' then 'in' else 'out' end end as io
) io0
cross join lateral (
  select io0.io,
    case
      when t."NO" = 29 then '소모품'            -- 슬리퍼2개 (시술매출로 잘못 분류)
      when t."NO" = 43 then '가구·장비'         -- 커튼맞춤 (시술매출로 잘못 분류)
      when t."NO" = 30 then '시술 매출(수기)'   -- 고모 (가구/장비로 잘못 분류)
      when w."WHAT_NM" = '재료비' then '재료비'
      when w."WHAT_NM" = '임대료' then '임대료'
      when w."WHAT_NM" = '공과금' then '관리비·공과금'
      when w."WHAT_NM" = '가구/장비' then '가구·장비'
      when w."WHAT_NM" = '공사비' then '공사비'
      when w."WHAT_NM" = '시술매출' then '시술 매출(수기)'
      when w."WHAT_NM" = '제품매출' then '제품 판매'
      when w."WHAT_NM" = '기타' and io0.io = 'in' then '기타 수입'
      else '기타'
    end as name
) m
join sh_shop_ledger_categories c on c.io = m.io and c.name = m.name
where coalesce(t."DEL_YN", 'N') <> 'Y'
on conflict (legacy_est_no) do nothing;
