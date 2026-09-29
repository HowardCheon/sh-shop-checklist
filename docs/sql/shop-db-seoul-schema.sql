create extension if not exists btree_gist;

create extension if not exists pgcrypto;

create sequence if not exists public.sh_shop_checklist_history_id_seq;

create sequence if not exists public.sh_shop_locations_id_seq;

create sequence if not exists public.sh_shop_products_id_seq;

create table if not exists public.sh_shop_customers (
  "id" bigint generated always as identity not null,
  "name" text not null,
  "phone" text,
  "memo" text,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "prepaid_cash" integer default 0 not null,
  "prepaid_bonus" integer default 0 not null
);

create table if not exists public.sh_shop_products (
  "id" integer default nextval('sh_shop_products_id_seq'::regclass) not null,
  "category" text not null,
  "name" text not null,
  "price" integer not null,
  "duration_min" integer,
  "stock" integer,
  "description" text,
  "is_active" boolean default true,
  "sort_order" integer default 0,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "member_price" integer,
  "service_group" text,
  "slug" text
);

create table if not exists public.sh_shop_reservations (
  "id" bigint generated always as identity not null,
  "customer_name" text not null,
  "customer_phone" text,
  "customer_id" bigint,
  "product_id" bigint,
  "product_name" text,
  "duration_min" integer,
  "start_at" timestamp with time zone not null,
  "end_at" timestamp with time zone not null,
  "price" integer,
  "status" text default 'scheduled'::text not null,
  "memo" text,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "block_end_at" timestamp with time zone not null,
  "source" text default 'admin'::text not null,
  "price_type" text
);

create table if not exists public.sh_shop_reservation_history (
  "id" bigint generated always as identity not null,
  "reservation_id" bigint,
  "action" text not null,
  "description" text,
  "old_value" jsonb,
  "new_value" jsonb,
  "changed_at" timestamp with time zone default now()
);

create table if not exists public.sh_shop_customer_history (
  "id" bigint generated always as identity not null,
  "customer_id" bigint not null,
  "reservation_id" bigint,
  "action" text not null,
  "actor" text not null,
  "description" text,
  "old_value" jsonb,
  "new_value" jsonb,
  "created_at" timestamp with time zone default now() not null
);

create table if not exists public.sh_shop_payments (
  "id" bigint generated always as identity not null,
  "customer_id" bigint,
  "reservation_id" bigint,
  "total_amount" integer not null,
  "prepaid_cash_used" integer default 0 not null,
  "prepaid_bonus_used" integer default 0 not null,
  "other_method" text,
  "other_amount" integer default 0 not null,
  "status" text default 'paid'::text not null,
  "memo" text,
  "created_at" timestamp with time zone default now() not null,
  "voided_at" timestamp with time zone
);

create table if not exists public.sh_shop_prepaid_ledger (
  "id" bigint generated always as identity not null,
  "customer_id" bigint not null,
  "type" text not null,
  "cash_amount" integer not null,
  "bonus_amount" integer not null,
  "cash_balance_after" integer not null,
  "bonus_balance_after" integer not null,
  "memo" text,
  "created_at" timestamp with time zone default now() not null,
  "payment_id" bigint
);

create table if not exists public.sh_shop_closed_dates (
  "date" date not null,
  "reason" text,
  "created_at" timestamp with time zone default now() not null
);

create table if not exists public.sh_shop_login_attempts (
  "id" bigint generated always as identity not null,
  "ip" text not null,
  "created_at" timestamp with time zone default now() not null
);

create table if not exists public.sh_shop_checklist_sessions (
  "session_id" text not null,
  "write_token" text not null,
  "created_at" timestamp with time zone default now()
);

create table if not exists public.sh_shop_checklist (
  "session_id" text not null,
  "item_id" text not null,
  "checked_at" timestamp with time zone default now(),
  "note" text default ''::text,
  "updated_at" timestamp with time zone default now(),
  "is_checked" boolean default true
);

create table if not exists public.sh_shop_checklist_history (
  "id" bigint default nextval('sh_shop_checklist_history_id_seq'::regclass) not null,
  "session_id" text not null,
  "item_id" text not null,
  "action" text not null,
  "note" text,
  "created_at" timestamp with time zone default now()
);

create table if not exists public.sh_shop_floorplans (
  "slug" text not null,
  "data" jsonb not null,
  "updated_at" timestamp with time zone default now() not null
);

create table if not exists public.sh_shop_locations (
  "id" integer default nextval('sh_shop_locations_id_seq'::regclass) not null,
  "name" text not null,
  "deposit" integer,
  "monthly_rent" integer,
  "maintenance_fee" integer,
  "pros" text,
  "cons" text,
  "memo" text,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now()
);

alter sequence public.sh_shop_checklist_history_id_seq owned by public.sh_shop_checklist_history."id";

alter sequence public.sh_shop_locations_id_seq owned by public.sh_shop_locations."id";

alter sequence public.sh_shop_products_id_seq owned by public.sh_shop_products."id";

do $$ begin if not exists (select 1 from pg_constraint where conname = 'sh_shop_checklist_history_pkey') then
      alter table public.sh_shop_checklist_history add constraint "sh_shop_checklist_history_pkey" PRIMARY KEY (id); end if; end $$;

do $$ begin if not exists (select 1 from pg_constraint where conname = 'sh_shop_checklist_pkey') then
      alter table public.sh_shop_checklist add constraint "sh_shop_checklist_pkey" PRIMARY KEY (session_id, item_id); end if; end $$;

do $$ begin if not exists (select 1 from pg_constraint where conname = 'sh_shop_checklist_sessions_pkey') then
      alter table public.sh_shop_checklist_sessions add constraint "sh_shop_checklist_sessions_pkey" PRIMARY KEY (session_id); end if; end $$;

do $$ begin if not exists (select 1 from pg_constraint where conname = 'sh_shop_closed_dates_pkey') then
      alter table public.sh_shop_closed_dates add constraint "sh_shop_closed_dates_pkey" PRIMARY KEY (date); end if; end $$;

do $$ begin if not exists (select 1 from pg_constraint where conname = 'sh_shop_customer_history_pkey') then
      alter table public.sh_shop_customer_history add constraint "sh_shop_customer_history_pkey" PRIMARY KEY (id); end if; end $$;

do $$ begin if not exists (select 1 from pg_constraint where conname = 'sh_shop_customers_pkey') then
      alter table public.sh_shop_customers add constraint "sh_shop_customers_pkey" PRIMARY KEY (id); end if; end $$;

do $$ begin if not exists (select 1 from pg_constraint where conname = 'sh_shop_floorplans_pkey') then
      alter table public.sh_shop_floorplans add constraint "sh_shop_floorplans_pkey" PRIMARY KEY (slug); end if; end $$;

do $$ begin if not exists (select 1 from pg_constraint where conname = 'sh_shop_locations_pkey') then
      alter table public.sh_shop_locations add constraint "sh_shop_locations_pkey" PRIMARY KEY (id); end if; end $$;

do $$ begin if not exists (select 1 from pg_constraint where conname = 'sh_shop_login_attempts_pkey') then
      alter table public.sh_shop_login_attempts add constraint "sh_shop_login_attempts_pkey" PRIMARY KEY (id); end if; end $$;

do $$ begin if not exists (select 1 from pg_constraint where conname = 'sh_shop_payments_pkey') then
      alter table public.sh_shop_payments add constraint "sh_shop_payments_pkey" PRIMARY KEY (id); end if; end $$;

do $$ begin if not exists (select 1 from pg_constraint where conname = 'sh_shop_payments_total_amount_check') then
      alter table public.sh_shop_payments add constraint "sh_shop_payments_total_amount_check" CHECK ((total_amount >= 0)); end if; end $$;

do $$ begin if not exists (select 1 from pg_constraint where conname = 'sh_shop_prepaid_ledger_pkey') then
      alter table public.sh_shop_prepaid_ledger add constraint "sh_shop_prepaid_ledger_pkey" PRIMARY KEY (id); end if; end $$;

do $$ begin if not exists (select 1 from pg_constraint where conname = 'sh_shop_products_pkey') then
      alter table public.sh_shop_products add constraint "sh_shop_products_pkey" PRIMARY KEY (id); end if; end $$;

do $$ begin if not exists (select 1 from pg_constraint where conname = 'sh_shop_reservation_history_pkey') then
      alter table public.sh_shop_reservation_history add constraint "sh_shop_reservation_history_pkey" PRIMARY KEY (id); end if; end $$;

do $$ begin if not exists (select 1 from pg_constraint where conname = 'sh_shop_reservations_no_overlap') then
      alter table public.sh_shop_reservations add constraint "sh_shop_reservations_no_overlap" EXCLUDE USING gist (tstzrange(start_at, block_end_at, '[)'::text) WITH &&) WHERE ((status <> 'cancelled'::text)); end if; end $$;

do $$ begin if not exists (select 1 from pg_constraint where conname = 'sh_shop_reservations_pkey') then
      alter table public.sh_shop_reservations add constraint "sh_shop_reservations_pkey" PRIMARY KEY (id); end if; end $$;

do $$ begin if not exists (select 1 from pg_constraint where conname = 'sh_shop_customer_history_customer_id_fkey') then
      alter table public.sh_shop_customer_history add constraint "sh_shop_customer_history_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES sh_shop_customers(id) ON DELETE CASCADE; end if; end $$;

do $$ begin if not exists (select 1 from pg_constraint where conname = 'sh_shop_payments_customer_id_fkey') then
      alter table public.sh_shop_payments add constraint "sh_shop_payments_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES sh_shop_customers(id) ON DELETE SET NULL; end if; end $$;

do $$ begin if not exists (select 1 from pg_constraint where conname = 'sh_shop_payments_reservation_id_fkey') then
      alter table public.sh_shop_payments add constraint "sh_shop_payments_reservation_id_fkey" FOREIGN KEY (reservation_id) REFERENCES sh_shop_reservations(id) ON DELETE SET NULL; end if; end $$;

do $$ begin if not exists (select 1 from pg_constraint where conname = 'sh_shop_prepaid_ledger_customer_id_fkey') then
      alter table public.sh_shop_prepaid_ledger add constraint "sh_shop_prepaid_ledger_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES sh_shop_customers(id) ON DELETE CASCADE; end if; end $$;

do $$ begin if not exists (select 1 from pg_constraint where conname = 'sh_shop_prepaid_ledger_payment_id_fkey') then
      alter table public.sh_shop_prepaid_ledger add constraint "sh_shop_prepaid_ledger_payment_id_fkey" FOREIGN KEY (payment_id) REFERENCES sh_shop_payments(id) ON DELETE SET NULL; end if; end $$;

do $$ begin if not exists (select 1 from pg_constraint where conname = 'sh_shop_reservation_history_reservation_id_fkey') then
      alter table public.sh_shop_reservation_history add constraint "sh_shop_reservation_history_reservation_id_fkey" FOREIGN KEY (reservation_id) REFERENCES sh_shop_reservations(id) ON DELETE CASCADE; end if; end $$;

do $$ begin if not exists (select 1 from pg_constraint where conname = 'sh_shop_reservations_customer_id_fkey') then
      alter table public.sh_shop_reservations add constraint "sh_shop_reservations_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES sh_shop_customers(id) ON DELETE SET NULL; end if; end $$;

do $$ begin if not exists (select 1 from pg_constraint where conname = 'sh_shop_reservations_product_id_fkey') then
      alter table public.sh_shop_reservations add constraint "sh_shop_reservations_product_id_fkey" FOREIGN KEY (product_id) REFERENCES sh_shop_products(id) ON DELETE SET NULL; end if; end $$;

CREATE INDEX IF NOT EXISTS idx_sh_history_session_item ON public.sh_shop_checklist_history USING btree (session_id, item_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS sh_shop_products_slug_uq ON public.sh_shop_products USING btree (slug) WHERE (slug IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS sh_shop_customers_phone_uq ON public.sh_shop_customers USING btree (phone) WHERE (phone IS NOT NULL);

CREATE INDEX IF NOT EXISTS sh_shop_customer_history_customer_idx ON public.sh_shop_customer_history USING btree (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sh_shop_prepaid_ledger_customer_idx ON public.sh_shop_prepaid_ledger USING btree (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sh_shop_payments_customer_idx ON public.sh_shop_payments USING btree (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sh_shop_payments_reservation_idx ON public.sh_shop_payments USING btree (reservation_id);

CREATE INDEX IF NOT EXISTS sh_shop_login_attempts_idx ON public.sh_shop_login_attempts USING btree (created_at DESC, ip);

alter table public.sh_shop_checklist_history enable row level security;

alter table public.sh_shop_products enable row level security;

alter table public.sh_shop_checklist enable row level security;

alter table public.sh_shop_checklist_sessions enable row level security;

alter table public.sh_shop_locations enable row level security;

alter table public.sh_shop_reservation_history enable row level security;

alter table public.sh_shop_floorplans enable row level security;

alter table public.sh_shop_customers enable row level security;

alter table public.sh_shop_reservations enable row level security;

alter table public.sh_shop_customer_history enable row level security;

alter table public.sh_shop_prepaid_ledger enable row level security;

alter table public.sh_shop_closed_dates enable row level security;

alter table public.sh_shop_payments enable row level security;

alter table public.sh_shop_login_attempts enable row level security;

CREATE OR REPLACE FUNCTION public.sh_shop_pay(p_customer_id bigint, p_reservation_id bigint, p_amount integer, p_use_prepaid boolean, p_other_method text, p_memo text)
 RETURNS sh_shop_payments
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
end $function$
;

revoke all on function sh_shop_pay(bigint,bigint,integer,boolean,text,text) from public, anon, authenticated;

grant execute on function sh_shop_pay(bigint,bigint,integer,boolean,text,text) to service_role;

CREATE OR REPLACE FUNCTION public.sh_shop_payment_void(p_payment_id bigint)
 RETURNS sh_shop_payments
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
end $function$
;

revoke all on function sh_shop_payment_void(bigint) from public, anon, authenticated;

grant execute on function sh_shop_payment_void(bigint) to service_role;

CREATE OR REPLACE FUNCTION public.sh_shop_prepaid_charge(p_customer_id bigint, p_amount integer, p_bonus integer, p_memo text)
 RETURNS sh_shop_customers
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
end $function$
;

revoke all on function sh_shop_prepaid_charge(bigint,integer,integer,text) from public, anon, authenticated;

grant execute on function sh_shop_prepaid_charge(bigint,integer,integer,text) to service_role;

CREATE OR REPLACE FUNCTION public.sh_shop_prepaid_refund(p_customer_id bigint, p_memo text)
 RETURNS json
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
end $function$
;

revoke all on function sh_shop_prepaid_refund(bigint,text) from public, anon, authenticated;

grant execute on function sh_shop_prepaid_refund(bigint,text) to service_role;
-- 기존 DB 와 동일한 기본 시간대
alter database postgres set timezone to 'Asia/Seoul';
