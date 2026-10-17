-- 관리자 겹침 허용 · 정리시간 10분 · 첫체험(베이직) 메뉴
-- 실행: node scripts/run-sql.mjs docs/sql/2026-10-17-admin-overlap.sql

-- 관리자가 겹침을 확인하고 저장한 예약은 배타 제약에서 제외 (고객 예약은 앱에서 모든 블록을 피함)
alter table sh_shop_reservations add column if not exists allow_overlap boolean not null default false;
alter table sh_shop_reservations drop constraint if exists sh_shop_reservations_no_overlap;
alter table sh_shop_reservations add constraint sh_shop_reservations_no_overlap
  exclude using gist (tstzrange(start_at, block_end_at, '[)') with &&) where (status <> 'cancelled' and not allow_overlap);

-- 정리시간 20분 → 10분: 앞으로의 예약 블록 재계산 (줄어들기만 하므로 새 겹침 없음)
update sh_shop_reservations
  set block_end_at = end_at + interval '10 minutes'
  where status = 'scheduled' and start_at >= now() and block_end_at > end_at + interval '10 minutes';

-- 첫체험(베이직) — FACE 맨 앞
insert into sh_shop_products (category, service_group, slug, name, price, member_price, duration_min, sort_order, is_active)
select 'service', 'FACE', 'first-trial-basic', '첫체험(베이직)', 39000, 39000, 50, 20, true
where not exists (select 1 from sh_shop_products where slug = 'first-trial-basic');

-- 첫체험(스톤 등 근막 순환케어) — BODY 맨 앞
insert into sh_shop_products (category, service_group, slug, name, price, member_price, duration_min, sort_order, is_active)
select 'service', 'BODY', 'first-trial-back', '첫체험(스톤 등 근막 순환케어)', 39000, 39000, 50, 10, true
where not exists (select 1 from sh_shop_products where slug = 'first-trial-back');
