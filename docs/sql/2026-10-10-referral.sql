-- 소개 보너스 · 보너스 수동 추가 (2026-10-10)
-- 실행: node scripts/run-sql.mjs docs/sql/2026-10-10-referral.sql
-- 원장 타입 추가: referral(소개 적립) | referral_revoke(소개 회수) | bonus_grant(수동 추가) — 모두 보너스만, cash_amount = 0

alter table sh_shop_customers
  add column if not exists referred_by bigint references sh_shop_customers(id) on delete set null,
  add column if not exists referred_at timestamptz;
alter table sh_shop_customers drop constraint if exists sh_shop_customers_referred_self_check;
alter table sh_shop_customers add constraint sh_shop_customers_referred_self_check check (referred_by is null or referred_by <> id);
create index if not exists sh_shop_customers_referred_by_idx on sh_shop_customers(referred_by) where referred_by is not null;

-- 결제별 "소개자가 받아야 할 보너스" — 실제 잔액 변동은 원장, 이 표는 목표 금액 (회수 부족분이 있어도 이중 지급 방지)
create table if not exists sh_shop_referral_rewards (
  payment_id bigint primary key references sh_shop_payments(id) on delete cascade,
  referrer_id bigint references sh_shop_customers(id) on delete set null,
  referred_id bigint references sh_shop_customers(id) on delete set null,
  reward_amount integer not null default 0 check (reward_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sh_shop_referral_rewards_referrer_idx on sh_shop_referral_rewards(referrer_id);
create index if not exists sh_shop_referral_rewards_referred_idx on sh_shop_referral_rewards(referred_id);
alter table sh_shop_referral_rewards enable row level security;

-- 소개 보너스 대상 결제의 서비스일 (예약 시작일, 첫체험권은 결제일 — KST). 대상이 아니면 null
create or replace function sh_shop_referral_service_date(p_payment_id bigint)
returns date language sql stable set search_path = public as $$
  select case
    when x.reservation_id is not null then (select (r.start_at at time zone 'Asia/Seoul')::date from sh_shop_reservations r where r.id = x.reservation_id)
    when exists (select 1 from sh_shop_trial_packages t where t.payment_id = x.id) then (x.created_at at time zone 'Asia/Seoul')::date
  end
  from sh_shop_payments x where x.id = p_payment_id
$$;

-- 결제 한 건의 소개 보너스 동기화 (멱등) — 목표 금액 재계산 → 차액만 소개자 보너스에 반영
create or replace function sh_shop_referral_sync(p_payment_id bigint)
returns void language plpgsql set search_path = public as $$
declare
  p sh_shop_payments;
  rw sh_shop_referral_rewards;
  a sh_shop_customers;
  v_referrer bigint;
  v_referred_at timestamptz;
  v_name text;
  v_date date;
  v_start date;
  v_target integer := 0;
  v_diff integer;
  v_take integer;
begin
  select * into p from sh_shop_payments where id = p_payment_id;
  if not found or p.customer_id is null then return; end if;
  select name, referred_by, referred_at into v_name, v_referrer, v_referred_at from sh_shop_customers where id = p.customer_id;

  select * into rw from sh_shop_referral_rewards where payment_id = p.id for update;
  if found then
    v_referrer := rw.referrer_id; -- 한 번 정해진 결제의 소개자는 유지
  elsif v_referrer is null or v_referred_at is null or p.created_at < v_referred_at then
    return; -- 소개자 없음 / 등록 이전 결제 (소급 없음)
  end if;
  if v_referrer is null then return; end if; -- 소개자 삭제됨

  if p.status = 'paid' then
    v_date := sh_shop_referral_service_date(p.id);
    if v_date is not null then
      select min(sh_shop_referral_service_date(x.id)) into v_start
        from sh_shop_payments x where x.customer_id = p.customer_id and x.status = 'paid';
      if v_date < (v_start + interval '1 year')::date then
        v_target := floor(p.total_amount * 0.1)::integer;
      end if;
    end if;
  end if;

  v_diff := v_target - coalesce(rw.reward_amount, 0);
  if v_diff = 0 then return; end if;

  select * into a from sh_shop_customers where id = v_referrer for update;
  if not found then return; end if;
  if v_diff > 0 then
    update sh_shop_customers set prepaid_bonus = prepaid_bonus + v_diff, updated_at = now() where id = a.id returning * into a;
    insert into sh_shop_prepaid_ledger (customer_id, type, cash_amount, bonus_amount, cash_balance_after, bonus_balance_after, memo, payment_id)
    values (a.id, 'referral', 0, v_diff, a.prepaid_cash, a.prepaid_bonus, '소개 보너스 — ' || coalesce(v_name, '-'), p.id);
  else
    v_take := least(-v_diff, a.prepaid_bonus);
    update sh_shop_customers set prepaid_bonus = prepaid_bonus - v_take, updated_at = now() where id = a.id returning * into a;
    insert into sh_shop_prepaid_ledger (customer_id, type, cash_amount, bonus_amount, cash_balance_after, bonus_balance_after, memo, payment_id)
    values (a.id, 'referral_revoke', 0, -v_take, a.prepaid_cash, a.prepaid_bonus,
            '소개 보너스 회수 — ' || coalesce(v_name, '-') || case when v_take < -v_diff then format(' (잔액 부족 %s원 미회수)', -v_diff - v_take) else '' end, p.id);
  end if;

  insert into sh_shop_referral_rewards (payment_id, referrer_id, referred_id, reward_amount)
  values (p.id, v_referrer, p.customer_id, v_target)
  on conflict (payment_id) do update set reward_amount = excluded.reward_amount, updated_at = now();
end $$;

-- 결제 생성·금액 수정·취소 시 같은 트랜잭션에서 동기화
create or replace function sh_shop_referral_payment_trg()
returns trigger language plpgsql set search_path = public as $$
begin
  perform sh_shop_referral_sync(new.id);
  return null;
end $$;
drop trigger if exists sh_shop_payments_referral on sh_shop_payments;
create trigger sh_shop_payments_referral after insert or update of total_amount, status on sh_shop_payments
  for each row execute function sh_shop_referral_payment_trg();

-- 첫체험권 등록은 결제 후 패키지가 연결되므로 이때 다시 동기화
create or replace function sh_shop_referral_trial_trg()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.payment_id is not null then perform sh_shop_referral_sync(new.payment_id); end if;
  return null;
end $$;
drop trigger if exists sh_shop_trial_packages_referral on sh_shop_trial_packages;
create trigger sh_shop_trial_packages_referral after insert on sh_shop_trial_packages
  for each row execute function sh_shop_referral_trial_trg();

-- 소개자 지정/해제 — 보상 기록이 있으면 변경 불가
create or replace function sh_shop_set_referrer(p_customer_id bigint, p_referrer_id bigint)
returns sh_shop_customers language plpgsql set search_path = public as $$
declare c sh_shop_customers;
begin
  select * into c from sh_shop_customers where id = p_customer_id for update;
  if not found then raise exception 'CUSTOMER_NOT_FOUND'; end if;
  if c.referred_by is not distinct from p_referrer_id then return c; end if;
  if p_referrer_id = p_customer_id then raise exception 'SELF_REFERRAL'; end if;
  if p_referrer_id is not null and not exists (select 1 from sh_shop_customers where id = p_referrer_id) then raise exception 'REFERRER_NOT_FOUND'; end if;
  if exists (select 1 from sh_shop_referral_rewards where referred_id = p_customer_id) then raise exception 'REFERRAL_LOCKED'; end if;
  update sh_shop_customers
     set referred_by = p_referrer_id, referred_at = case when p_referrer_id is null then null else now() end, updated_at = now()
   where id = c.id returning * into c;
  return c;
end $$;

-- 보너스 수동 추가
create or replace function sh_shop_bonus_grant(p_customer_id bigint, p_amount integer, p_memo text)
returns sh_shop_customers language plpgsql set search_path = public as $$
declare c sh_shop_customers;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if nullif(trim(p_memo), '') is null then raise exception 'MEMO_REQUIRED'; end if;
  update sh_shop_customers set prepaid_bonus = prepaid_bonus + p_amount, updated_at = now()
   where id = p_customer_id returning * into c;
  if not found then raise exception 'CUSTOMER_NOT_FOUND'; end if;
  insert into sh_shop_prepaid_ledger (customer_id, type, cash_amount, bonus_amount, cash_balance_after, bonus_balance_after, memo)
  values (c.id, 'bonus_grant', 0, p_amount, c.prepaid_cash, c.prepaid_bonus, trim(p_memo));
  return c;
end $$;

-- 실행 권한: service_role 만
revoke all on function sh_shop_referral_service_date(bigint) from public, anon, authenticated;
revoke all on function sh_shop_referral_sync(bigint) from public, anon, authenticated;
revoke all on function sh_shop_set_referrer(bigint, bigint) from public, anon, authenticated;
revoke all on function sh_shop_bonus_grant(bigint, integer, text) from public, anon, authenticated;
grant execute on function sh_shop_referral_service_date(bigint) to service_role;
grant execute on function sh_shop_referral_sync(bigint) to service_role;
grant execute on function sh_shop_set_referrer(bigint, bigint) to service_role;
grant execute on function sh_shop_bonus_grant(bigint, integer, text) to service_role;
