-- 2단계 리뷰 반영 (2026-09-28)

-- 환불 이후 결제 취소 시 보너스는 복원하지 않음 (환불 시 소멸 규칙)
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

-- 관리자 로그인 시도 기록 (인스턴스 간 공유 제한)
create table if not exists sh_shop_login_attempts (
  id bigint generated always as identity primary key,
  ip text not null,
  created_at timestamptz not null default now()
);
create index if not exists sh_shop_login_attempts_idx on sh_shop_login_attempts(created_at desc, ip);
alter table sh_shop_login_attempts enable row level security;
