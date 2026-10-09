-- 샵 가계부 리뷰 보완 (2026-10-09)
-- 1) 고객을 삭제해도 선불 원장은 남김 — 지난 달 매출·선불 현황이 소급해서 바뀌지 않도록
alter table sh_shop_prepaid_ledger alter column customer_id drop not null;
alter table sh_shop_prepaid_ledger drop constraint if exists sh_shop_prepaid_ledger_customer_id_fkey;
alter table sh_shop_prepaid_ledger add constraint sh_shop_prepaid_ledger_customer_id_fkey
  foreign key (customer_id) references sh_shop_customers(id) on delete set null;

-- 2) 조회 행 수 상한(1000건)에 걸리지 않도록 합계는 DB 에서
create or replace function sh_shop_ledger_prepaid_before(p_before timestamptz)
returns table (cash bigint, bonus bigint) language sql stable set search_path = public as $$
  select coalesce(sum(cash_amount), 0), coalesce(sum(bonus_amount), 0) from sh_shop_prepaid_ledger where created_at < p_before
$$;
create or replace function sh_shop_ledger_category_uses()
returns table (category_id bigint, uses bigint) language sql stable set search_path = public as $$
  select category_id, count(*) from sh_shop_ledger_entries group by category_id
$$;
revoke all on function sh_shop_ledger_prepaid_before(timestamptz) from public, anon, authenticated;
revoke all on function sh_shop_ledger_category_uses() from public, anon, authenticated;
grant execute on function sh_shop_ledger_prepaid_before(timestamptz) to service_role;
grant execute on function sh_shop_ledger_category_uses() to service_role;
