-- 외부 예약 API 1단계 마이그레이션 (2026-09-28)
-- 실행: node scripts/run-sql.mjs docs/sql/2026-09-28-booking.sql

create extension if not exists btree_gist;

-- 상품: 회원가 / FACE·BODY 분류
alter table sh_shop_products
  add column if not exists member_price integer,
  add column if not exists service_group text;

-- 고객: 선불충전금(실제/보너스), 전화번호 유일
alter table sh_shop_customers
  add column if not exists prepaid_cash integer not null default 0,
  add column if not exists prepaid_bonus integer not null default 0;
update sh_shop_customers set phone = nullif(regexp_replace(phone, '[^0-9]', '', 'g'), '') where phone is not null;
create unique index if not exists sh_shop_customers_phone_uq on sh_shop_customers(phone) where phone is not null;

-- 예약: 정리시간 포함 블록 종료, 출처, 가격 유형, 겹침 금지 제약
alter table sh_shop_reservations
  add column if not exists block_end_at timestamptz,
  add column if not exists source text not null default 'admin',
  add column if not exists price_type text;
update sh_shop_reservations set block_end_at = end_at + interval '20 minutes' where block_end_at is null;
alter table sh_shop_reservations alter column block_end_at set not null;
alter table sh_shop_reservations drop constraint if exists sh_shop_reservations_no_overlap;
alter table sh_shop_reservations add constraint sh_shop_reservations_no_overlap
  exclude using gist (tstzrange(start_at, block_end_at, '[)') with &&) where (status <> 'cancelled');

-- 고객 이력
create table if not exists sh_shop_customer_history (
  id bigint generated always as identity primary key,
  customer_id bigint not null references sh_shop_customers(id) on delete cascade,
  reservation_id bigint,
  action text not null,          -- reservation_created | reservation_updated | reservation_cancelled | prepaid_charged
  actor text not null,           -- external | admin
  description text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);
create index if not exists sh_shop_customer_history_customer_idx on sh_shop_customer_history(customer_id, created_at desc);

-- 선불충전금 원장
create table if not exists sh_shop_prepaid_ledger (
  id bigint generated always as identity primary key,
  customer_id bigint not null references sh_shop_customers(id) on delete cascade,
  type text not null,            -- charge (2단계: use | refund)
  cash_amount integer not null,
  bonus_amount integer not null,
  cash_balance_after integer not null,
  bonus_balance_after integer not null,
  memo text,
  created_at timestamptz not null default now()
);
create index if not exists sh_shop_prepaid_ledger_customer_idx on sh_shop_prepaid_ledger(customer_id, created_at desc);

-- 휴무일
create table if not exists sh_shop_closed_dates (
  date date primary key,
  reason text,
  created_at timestamptz not null default now()
);

-- 시술 메뉴 시드 (price = 비회원가, member_price = 회원가)
update sh_shop_products set is_active = false where category = 'service' and name = '기본 클렌징 케어';
insert into sh_shop_products (id, category, service_group, name, price, member_price, duration_min, is_active, sort_order)
select coalesce((select max(id) from sh_shop_products), 0) + row_number() over (order by v.sort_order),
       'service', v.grp, v.name, v.price, v.member_price, v.duration_min, true, v.sort_order
from (values
  ('FACE', '베이직 관리', 80000, 50000, 60, 1),
  ('FACE', '시그니처 관리', 100000, 70000, 60, 2),
  ('FACE', '3D 윤곽관리', 120000, 80000, 80, 3),
  ('FACE', '수소테라피', 120000, 80000, 80, 4),
  ('FACE', '플라즈마', 120000, 80000, 80, 5),
  ('FACE', '펩타이드 단백질관리 + 플라즈마', 250000, 200000, 90, 6),
  ('FACE', 'MTS셀유스 줄기세포 + 플라즈마', 300000, 240000, 90, 7),
  ('BODY', '스톤 등테라피', 80000, 50000, 50, 11),
  ('BODY', '스톤 복부 테라피', 80000, 50000, 50, 12),
  ('BODY', '하체관리 (고주파+골반교정)', 120000, 80000, 60, 13),
  ('BODY', '상체관리 (고주파 등+복부+가슴+데콜테)', 120000, 80000, 60, 14),
  ('BODY', '전신관리 (고주파+수기)', 190000, 150000, 120, 15),
  ('BODY', '에너지 전신 (에너지관리+수기)', 190000, 150000, 120, 16),
  ('BODY', '전신 로즈디톡스 해독관리', 120000, 80000, 60, 17)
) as v(grp, name, price, member_price, duration_min, sort_order)
where not exists (select 1 from sh_shop_products p where p.name = v.name and p.category = 'service');
select setval('sh_shop_products_id_seq', (select max(id) from sh_shop_products));

-- 기존 예약 전화번호 정규화 + 고객 연결(백필)
update sh_shop_reservations set customer_phone = regexp_replace(customer_phone, '[^0-9]', '', 'g')
  where customer_phone ~ '^[0-9 +()-]+$' and regexp_replace(customer_phone, '[^0-9]', '', 'g') ~ '^01[016789][0-9]{7,8}$';
update sh_shop_reservations r set customer_id = c.id
  from sh_shop_customers c where r.customer_id is null and r.customer_phone = c.phone;
