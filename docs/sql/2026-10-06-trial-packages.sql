-- 첫체험 패키지 등록·사용 (2026-10-06)

create table if not exists sh_shop_trial_packages (
  id bigint generated always as identity primary key,
  customer_id bigint not null references sh_shop_customers(id) on delete cascade,
  package_code text not null,
  basic_total integer not null,
  special_total integer not null,
  basic_used integer not null default 0,
  special_used integer not null default 0,
  price integer not null,
  payment_id bigint references sh_shop_payments(id) on delete set null,
  expires_on date not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  check (basic_used between 0 and basic_total),
  check (special_used between 0 and special_total)
);
create unique index if not exists sh_shop_trial_packages_active_uq on sh_shop_trial_packages(customer_id) where status = 'active';
create index if not exists sh_shop_trial_packages_payment_idx on sh_shop_trial_packages(payment_id);

create table if not exists sh_shop_trial_uses (
  id bigint generated always as identity primary key,
  package_id bigint not null references sh_shop_trial_packages(id) on delete cascade,
  kind text not null check (kind in ('basic', 'special')),
  care_name text,
  status text not null default 'used',
  memo text,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);
create index if not exists sh_shop_trial_uses_package_idx on sh_shop_trial_uses(package_id);

alter table sh_shop_trial_packages enable row level security;
alter table sh_shop_trial_uses enable row level security;

-- 등록 = 결제(sh_shop_pay) + 패키지 생성
create or replace function sh_shop_trial_register(
  p_customer_id bigint, p_code text, p_price integer, p_basic integer, p_special integer,
  p_months integer, p_use_prepaid boolean, p_other_method text, p_memo text
) returns json language plpgsql set search_path = public as $$
declare
  v_pay sh_shop_payments;
  v_pkg sh_shop_trial_packages;
begin
  perform 1 from sh_shop_customers where id = p_customer_id for update;
  if not found then raise exception 'CUSTOMER_NOT_FOUND'; end if;
  if exists (select 1 from sh_shop_trial_packages where customer_id = p_customer_id and status = 'active') then
    raise exception 'ALREADY_REGISTERED';
  end if;
  select * into v_pay from sh_shop_pay(p_customer_id, null, p_price, p_use_prepaid, p_other_method, p_memo);
  insert into sh_shop_trial_packages (customer_id, package_code, basic_total, special_total, price, payment_id, expires_on)
  values (p_customer_id, p_code, p_basic, p_special, p_price, v_pay.id,
          ((now() at time zone 'Asia/Seoul')::date + make_interval(months => p_months))::date)
  returning * into v_pkg;
  return json_build_object('package', row_to_json(v_pkg), 'payment', row_to_json(v_pay));
end $$;

-- 사용 1회 차감 (만료는 막지 않음)
create or replace function sh_shop_trial_use(p_package_id bigint, p_kind text, p_care_name text, p_memo text)
returns json language plpgsql set search_path = public as $$
declare
  v_pkg sh_shop_trial_packages;
  v_use sh_shop_trial_uses;
begin
  if p_kind is null or p_kind not in ('basic', 'special') then raise exception 'INVALID_TRIAL_USE'; end if;
  select * into v_pkg from sh_shop_trial_packages where id = p_package_id for update;
  if not found then raise exception 'PACKAGE_NOT_FOUND'; end if;
  if v_pkg.status <> 'active' then raise exception 'PACKAGE_CANCELLED'; end if;
  if (p_kind = 'basic' and v_pkg.basic_used >= v_pkg.basic_total)
     or (p_kind = 'special' and v_pkg.special_used >= v_pkg.special_total) then
    raise exception 'NO_REMAINING';
  end if;
  update sh_shop_trial_packages
     set basic_used = basic_used + (p_kind = 'basic')::int, special_used = special_used + (p_kind = 'special')::int
   where id = v_pkg.id
  returning * into v_pkg;
  insert into sh_shop_trial_uses (package_id, kind, care_name, memo)
  values (v_pkg.id, p_kind, case when p_kind = 'special' then p_care_name end, nullif(trim(p_memo), ''))
  returning * into v_use;
  return json_build_object('use', row_to_json(v_use), 'package', row_to_json(v_pkg));
end $$;

-- 사용 1건 취소 (횟수 복원)
create or replace function sh_shop_trial_use_cancel(p_use_id bigint)
returns json language plpgsql set search_path = public as $$
declare
  v_pkg sh_shop_trial_packages;
  v_use sh_shop_trial_uses;
begin
  select * into v_use from sh_shop_trial_uses where id = p_use_id;
  if not found then raise exception 'USE_NOT_FOUND'; end if;
  select * into v_pkg from sh_shop_trial_packages where id = v_use.package_id for update;
  select * into v_use from sh_shop_trial_uses where id = p_use_id for update;
  if v_use.status <> 'used' then raise exception 'ALREADY_CANCELLED'; end if;
  update sh_shop_trial_uses set status = 'cancelled', cancelled_at = now() where id = v_use.id returning * into v_use;
  update sh_shop_trial_packages
     set basic_used = basic_used - (v_use.kind = 'basic')::int, special_used = special_used - (v_use.kind = 'special')::int
   where id = v_pkg.id
  returning * into v_pkg;
  return json_build_object('use', row_to_json(v_use), 'package', row_to_json(v_pkg));
end $$;

-- 등록 취소 (유효 사용 없을 때만, 결제 취소 포함)
create or replace function sh_shop_trial_cancel(p_package_id bigint)
returns json language plpgsql set search_path = public as $$
declare
  v_pkg sh_shop_trial_packages;
  v_pay sh_shop_payments;
begin
  select * into v_pkg from sh_shop_trial_packages where id = p_package_id for update;
  if not found then raise exception 'PACKAGE_NOT_FOUND'; end if;
  if v_pkg.status <> 'active' then raise exception 'ALREADY_CANCELLED'; end if;
  if exists (select 1 from sh_shop_trial_uses where package_id = v_pkg.id and status = 'used') then
    raise exception 'HAS_USES';
  end if;
  update sh_shop_trial_packages set status = 'cancelled', cancelled_at = now() where id = v_pkg.id returning * into v_pkg;
  if exists (select 1 from sh_shop_payments where id = v_pkg.payment_id and status = 'paid') then
    select * into v_pay from sh_shop_payment_void(v_pkg.payment_id);
  end if;
  return json_build_object('package', row_to_json(v_pkg), 'payment', case when v_pay.id is null then null else row_to_json(v_pay) end);
end $$;

revoke all on function sh_shop_trial_register(bigint, text, integer, integer, integer, integer, boolean, text, text) from public, anon, authenticated;
revoke all on function sh_shop_trial_use(bigint, text, text, text) from public, anon, authenticated;
revoke all on function sh_shop_trial_use_cancel(bigint) from public, anon, authenticated;
revoke all on function sh_shop_trial_cancel(bigint) from public, anon, authenticated;
grant execute on function sh_shop_trial_register(bigint, text, integer, integer, integer, integer, boolean, text, text) to service_role;
grant execute on function sh_shop_trial_use(bigint, text, text, text) to service_role;
grant execute on function sh_shop_trial_use_cancel(bigint) to service_role;
grant execute on function sh_shop_trial_cancel(bigint) to service_role;

-- 유효 첫체험 패키지의 결제는 결제 취소 불가 (등록 취소 sh_shop_trial_cancel 로만 — 패키지를 먼저 cancelled 로 바꾼 뒤 호출)
create or replace function sh_shop_payment_void(p_payment_id bigint)
returns sh_shop_payments language plpgsql set search_path = public as $$
declare
  p sh_shop_payments;
  c sh_shop_customers;
  v_bonus integer;
begin
  select * into p from sh_shop_payments where id = p_payment_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if p.status <> 'paid' then raise exception 'ALREADY_VOIDED'; end if;
  if exists (select 1 from sh_shop_trial_packages where payment_id = p.id and status = 'active') then
    raise exception 'TRIAL_PAYMENT';
  end if;

  update sh_shop_payments set status = 'voided', voided_at = now() where id = p.id returning * into p;

  if p.prepaid_cash_used + p.prepaid_bonus_used > 0 and p.customer_id is not null then
    select * into c from sh_shop_customers where id = p.customer_id for update;
    v_bonus := case
      when exists (select 1 from sh_shop_prepaid_ledger l
                    where l.customer_id = p.customer_id and l.type = 'refund' and l.created_at > p.created_at)
      then 0 else p.prepaid_bonus_used end;
    update sh_shop_customers
       set prepaid_cash = prepaid_cash + p.prepaid_cash_used, prepaid_bonus = prepaid_bonus + v_bonus, updated_at = now()
     where id = p.customer_id
    returning * into c;
    insert into sh_shop_prepaid_ledger (customer_id, type, cash_amount, bonus_amount, cash_balance_after, bonus_balance_after, memo, payment_id)
    values (c.id, 'use_cancel', p.prepaid_cash_used, v_bonus, c.prepaid_cash, c.prepaid_bonus,
            case when v_bonus < p.prepaid_bonus_used then '결제 취소 (환불 이후라 보너스 미복원)' else '결제 취소' end, p.id);
  end if;
  return p;
end $$;
revoke all on function sh_shop_payment_void(bigint) from public, anon, authenticated;
grant execute on function sh_shop_payment_void(bigint) to service_role;
