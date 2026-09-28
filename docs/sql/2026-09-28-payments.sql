-- 2단계: 결제 / 선불 차감·환불 (2026-09-28)
-- 실행: node scripts/run-sql.mjs docs/sql/2026-09-28-payments.sql

create table if not exists sh_shop_payments (
  id bigint generated always as identity primary key,
  customer_id bigint references sh_shop_customers(id) on delete set null,
  reservation_id bigint references sh_shop_reservations(id) on delete set null,
  total_amount integer not null check (total_amount >= 0),
  prepaid_cash_used integer not null default 0,
  prepaid_bonus_used integer not null default 0,
  other_method text,               -- card | cash | transfer
  other_amount integer not null default 0,
  status text not null default 'paid',   -- paid | voided
  memo text,
  created_at timestamptz not null default now(),
  voided_at timestamptz
);
create index if not exists sh_shop_payments_customer_idx on sh_shop_payments(customer_id, created_at desc);
create index if not exists sh_shop_payments_reservation_idx on sh_shop_payments(reservation_id);
alter table sh_shop_payments enable row level security;

alter table sh_shop_prepaid_ledger add column if not exists payment_id bigint references sh_shop_payments(id) on delete set null;

-- 충전
create or replace function sh_shop_prepaid_charge(p_customer_id bigint, p_amount integer, p_bonus integer, p_memo text)
returns sh_shop_customers language plpgsql set search_path = public as $$
declare c sh_shop_customers;
begin
  if p_amount <= 0 or p_bonus < 0 then raise exception 'INVALID_AMOUNT'; end if;
  update sh_shop_customers
     set prepaid_cash = prepaid_cash + p_amount, prepaid_bonus = prepaid_bonus + p_bonus, updated_at = now()
   where id = p_customer_id
  returning * into c;
  if not found then raise exception 'CUSTOMER_NOT_FOUND'; end if;
  insert into sh_shop_prepaid_ledger (customer_id, type, cash_amount, bonus_amount, cash_balance_after, bonus_balance_after, memo)
  values (c.id, 'charge', p_amount, p_bonus, c.prepaid_cash, c.prepaid_bonus, p_memo);
  return c;
end $$;

-- 결제 (선불은 잔액 비율로 차감, 부족분은 기타 결제수단)
create or replace function sh_shop_pay(
  p_customer_id bigint, p_reservation_id bigint, p_amount integer,
  p_use_prepaid boolean, p_other_method text, p_memo text
) returns sh_shop_payments language plpgsql set search_path = public as $$
declare
  c sh_shop_customers;
  p sh_shop_payments;
  v_total integer;
  v_use integer;
  v_cash integer := 0;
  v_bonus integer := 0;
  v_other integer;
begin
  if p_amount is null or p_amount < 0 then raise exception 'INVALID_AMOUNT'; end if;
  if p_use_prepaid then
    select * into c from sh_shop_customers where id = p_customer_id for update;
    if not found then raise exception 'CUSTOMER_NOT_FOUND'; end if;
    v_total := c.prepaid_cash + c.prepaid_bonus;
    v_use := least(p_amount, v_total);
    if v_use > 0 then
      if v_use = v_total then
        v_bonus := c.prepaid_bonus;
      else
        v_bonus := floor(v_use::numeric * c.prepaid_bonus / v_total)::integer;
      end if;
      v_cash := v_use - v_bonus;
    end if;
  end if;

  v_other := p_amount - v_cash - v_bonus;
  if v_other > 0 and coalesce(p_other_method, '') not in ('card', 'cash', 'transfer') then
    raise exception 'OTHER_METHOD_REQUIRED';
  end if;

  insert into sh_shop_payments (customer_id, reservation_id, total_amount, prepaid_cash_used, prepaid_bonus_used, other_method, other_amount, memo)
  values (p_customer_id, p_reservation_id, p_amount, v_cash, v_bonus, case when v_other > 0 then p_other_method end, v_other, p_memo)
  returning * into p;

  if v_cash + v_bonus > 0 then
    update sh_shop_customers
       set prepaid_cash = prepaid_cash - v_cash, prepaid_bonus = prepaid_bonus - v_bonus, updated_at = now()
     where id = p_customer_id
    returning * into c;
    insert into sh_shop_prepaid_ledger (customer_id, type, cash_amount, bonus_amount, cash_balance_after, bonus_balance_after, memo, payment_id)
    values (c.id, 'use', -v_cash, -v_bonus, c.prepaid_cash, c.prepaid_bonus, p_memo, p.id);
  end if;
  return p;
end $$;

-- 결제 취소 (선불 차감분 복원)
create or replace function sh_shop_payment_void(p_payment_id bigint)
returns sh_shop_payments language plpgsql set search_path = public as $$
declare
  p sh_shop_payments;
  c sh_shop_customers;
begin
  select * into p from sh_shop_payments where id = p_payment_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if p.status <> 'paid' then raise exception 'ALREADY_VOIDED'; end if;

  update sh_shop_payments set status = 'voided', voided_at = now() where id = p.id returning * into p;

  if p.prepaid_cash_used + p.prepaid_bonus_used > 0 and p.customer_id is not null then
    update sh_shop_customers
       set prepaid_cash = prepaid_cash + p.prepaid_cash_used, prepaid_bonus = prepaid_bonus + p.prepaid_bonus_used, updated_at = now()
     where id = p.customer_id
    returning * into c;
    insert into sh_shop_prepaid_ledger (customer_id, type, cash_amount, bonus_amount, cash_balance_after, bonus_balance_after, memo, payment_id)
    values (c.id, 'use_cancel', p.prepaid_cash_used, p.prepaid_bonus_used, c.prepaid_cash, c.prepaid_bonus, '결제 취소', p.id);
  end if;
  return p;
end $$;

-- 환불 (실제 잔액 환불, 보너스 소멸)
create or replace function sh_shop_prepaid_refund(p_customer_id bigint, p_memo text)
returns json language plpgsql set search_path = public as $$
declare c sh_shop_customers;
declare v_cash integer;
declare v_bonus integer;
begin
  select * into c from sh_shop_customers where id = p_customer_id for update;
  if not found then raise exception 'CUSTOMER_NOT_FOUND'; end if;
  if c.prepaid_cash + c.prepaid_bonus = 0 then raise exception 'NO_BALANCE'; end if;
  v_cash := c.prepaid_cash;
  v_bonus := c.prepaid_bonus;
  update sh_shop_customers set prepaid_cash = 0, prepaid_bonus = 0, updated_at = now() where id = c.id;
  insert into sh_shop_prepaid_ledger (customer_id, type, cash_amount, bonus_amount, cash_balance_after, bonus_balance_after, memo)
  values (c.id, 'refund', -v_cash, -v_bonus, 0, 0, p_memo);
  return json_build_object('refund_amount', v_cash, 'bonus_forfeited', v_bonus);
end $$;

-- 실행 권한: service_role 만
revoke all on function sh_shop_prepaid_charge(bigint, integer, integer, text) from public, anon, authenticated;
revoke all on function sh_shop_pay(bigint, bigint, integer, boolean, text, text) from public, anon, authenticated;
revoke all on function sh_shop_payment_void(bigint) from public, anon, authenticated;
revoke all on function sh_shop_prepaid_refund(bigint, text) from public, anon, authenticated;
grant execute on function sh_shop_prepaid_charge(bigint, integer, integer, text) to service_role;
grant execute on function sh_shop_pay(bigint, bigint, integer, boolean, text, text) to service_role;
grant execute on function sh_shop_payment_void(bigint) to service_role;
grant execute on function sh_shop_prepaid_refund(bigint, text) to service_role;
