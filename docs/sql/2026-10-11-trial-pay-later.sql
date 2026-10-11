-- 첫체험권 나중에 결제 (2026-10-11)
-- 실행: node scripts/run-sql.mjs docs/sql/2026-10-11-trial-pay-later.sql
-- 미결제 = 유효 패키지의 payment_id 가 없고 price > 0

-- 등록 — p_pay_now = false 면 결제 없이 패키지만 (기본 true: 기존 호출과 호환)
drop function if exists sh_shop_trial_register(bigint, text, integer, integer, integer, integer, boolean, text, text);
create or replace function sh_shop_trial_register(
  p_customer_id bigint, p_code text, p_price integer, p_basic integer, p_special integer,
  p_months integer, p_use_prepaid boolean, p_other_method text, p_memo text, p_pay_now boolean default true
) returns json language plpgsql set search_path = public as $$
declare
  v_pay sh_shop_payments;
  v_pkg sh_shop_trial_packages;
begin
  if p_price is null or p_price < 0 then raise exception 'INVALID_AMOUNT'; end if;
  perform 1 from sh_shop_customers where id = p_customer_id for update;
  if not found then raise exception 'CUSTOMER_NOT_FOUND'; end if;
  if exists (select 1 from sh_shop_trial_packages where customer_id = p_customer_id and status = 'active') then
    raise exception 'ALREADY_REGISTERED';
  end if;
  if p_pay_now then
    select * into v_pay from sh_shop_pay(p_customer_id, null, p_price, p_use_prepaid, p_other_method, p_memo);
  end if;
  insert into sh_shop_trial_packages (customer_id, package_code, basic_total, special_total, price, payment_id, expires_on)
  values (p_customer_id, p_code, p_basic, p_special, p_price, v_pay.id,
          ((now() at time zone 'Asia/Seoul')::date + make_interval(months => p_months))::date)
  returning * into v_pkg;
  return json_build_object('package', row_to_json(v_pkg), 'payment', case when v_pay.id is null then null else row_to_json(v_pay) end);
end $$;

-- 미결제 패키지 결제 (예약 연결 없음 — 가계부 '첫체험' 매출)
create or replace function sh_shop_trial_pay(p_package_id bigint, p_use_prepaid boolean, p_other_method text, p_memo text)
returns json language plpgsql set search_path = public as $$
declare v_pkg sh_shop_trial_packages; v_pay sh_shop_payments;
begin
  select * into v_pkg from sh_shop_trial_packages where id = p_package_id for update;
  if not found then raise exception 'PACKAGE_NOT_FOUND'; end if;
  if v_pkg.status <> 'active' then raise exception 'PACKAGE_CANCELLED'; end if;
  if v_pkg.payment_id is not null and exists (select 1 from sh_shop_payments where id = v_pkg.payment_id and status = 'paid') then
    raise exception 'ALREADY_PAID';
  end if;
  if v_pkg.price <= 0 then raise exception 'NOTHING_TO_PAY'; end if;
  select * into v_pay from sh_shop_pay(v_pkg.customer_id, null, v_pkg.price, p_use_prepaid, p_other_method, p_memo);
  update sh_shop_trial_packages set payment_id = v_pay.id where id = v_pkg.id returning * into v_pkg;
  return json_build_object('package', row_to_json(v_pkg), 'payment', row_to_json(v_pay));
end $$;

-- 결제 취소 → 미결제로 (연결을 먼저 풀어야 sh_shop_payment_void 의 TRIAL_PAYMENT 검사를 통과)
create or replace function sh_shop_trial_unpay(p_package_id bigint)
returns json language plpgsql set search_path = public as $$
declare v_pkg sh_shop_trial_packages; v_pay sh_shop_payments; v_payment_id bigint;
begin
  select * into v_pkg from sh_shop_trial_packages where id = p_package_id for update;
  if not found then raise exception 'PACKAGE_NOT_FOUND'; end if;
  if v_pkg.status <> 'active' then raise exception 'PACKAGE_CANCELLED'; end if;
  v_payment_id := v_pkg.payment_id;
  if v_payment_id is null or not exists (select 1 from sh_shop_payments where id = v_payment_id and status = 'paid') then
    raise exception 'NOT_PAID';
  end if;
  update sh_shop_trial_packages set payment_id = null where id = v_pkg.id returning * into v_pkg;
  select * into v_pay from sh_shop_payment_void(v_payment_id);
  return json_build_object('package', row_to_json(v_pkg), 'payment', row_to_json(v_pay));
end $$;

-- 소개 보너스: 결제가 나중에 연결될 때도 동기화
drop trigger if exists sh_shop_trial_packages_referral on sh_shop_trial_packages;
create trigger sh_shop_trial_packages_referral after insert or update of payment_id on sh_shop_trial_packages
  for each row execute function sh_shop_referral_trial_trg();

revoke all on function sh_shop_trial_register(bigint, text, integer, integer, integer, integer, boolean, text, text, boolean) from public, anon, authenticated;
revoke all on function sh_shop_trial_pay(bigint, boolean, text, text) from public, anon, authenticated;
revoke all on function sh_shop_trial_unpay(bigint) from public, anon, authenticated;
grant execute on function sh_shop_trial_register(bigint, text, integer, integer, integer, integer, boolean, text, text, boolean) to service_role;
grant execute on function sh_shop_trial_pay(bigint, boolean, text, text) to service_role;
grant execute on function sh_shop_trial_unpay(bigint) to service_role;
