-- 시술 완료 첫체험 차감 · 결제 금액 수정 (2026-10-06)
alter table sh_shop_trial_uses add column if not exists reservation_id bigint references sh_shop_reservations(id) on delete set null;
create index if not exists sh_shop_trial_uses_reservation_idx on sh_shop_trial_uses(reservation_id) where reservation_id is not null;

drop function if exists sh_shop_trial_use(bigint, text, text, text);
create or replace function sh_shop_trial_use(p_package_id bigint, p_kind text, p_care_name text, p_memo text, p_reservation_id bigint default null)
returns json language plpgsql set search_path = public as $$
declare v_pkg sh_shop_trial_packages; v_use sh_shop_trial_uses;
begin
  if p_kind is null or p_kind not in ('basic', 'special') then raise exception 'INVALID_TRIAL_USE'; end if;
  select * into v_pkg from sh_shop_trial_packages where id = p_package_id for update;
  if not found then raise exception 'PACKAGE_NOT_FOUND'; end if;
  if v_pkg.status <> 'active' then raise exception 'PACKAGE_CANCELLED'; end if;
  if (p_kind = 'basic' and v_pkg.basic_used >= v_pkg.basic_total) or (p_kind = 'special' and v_pkg.special_used >= v_pkg.special_total) then
    raise exception 'NO_REMAINING';
  end if;
  update sh_shop_trial_packages set basic_used = basic_used + (p_kind = 'basic')::int, special_used = special_used + (p_kind = 'special')::int
   where id = v_pkg.id returning * into v_pkg;
  insert into sh_shop_trial_uses (package_id, kind, care_name, memo, reservation_id)
  values (v_pkg.id, p_kind, case when p_kind = 'special' then p_care_name end, nullif(trim(p_memo), ''), p_reservation_id)
  returning * into v_use;
  return json_build_object('use', row_to_json(v_use), 'package', row_to_json(v_pkg));
end $$;

create or replace function sh_shop_payment_adjust(p_payment_id bigint, p_total integer, p_other_method text)
returns sh_shop_payments language plpgsql set search_path = public as $$
declare p sh_shop_payments; v_other integer; v_method text;
begin
  if p_total is null or p_total < 0 then raise exception 'INVALID_AMOUNT'; end if;
  select * into p from sh_shop_payments where id = p_payment_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if p.status <> 'paid' then raise exception 'ALREADY_VOIDED'; end if;
  v_other := p_total - p.prepaid_cash_used - p.prepaid_bonus_used;
  if v_other < 0 then raise exception 'BELOW_PREPAID'; end if;
  v_method := coalesce(p_other_method, p.other_method);
  if v_other > 0 and coalesce(v_method, '') not in ('card', 'cash', 'transfer') then raise exception 'OTHER_METHOD_REQUIRED'; end if;
  update sh_shop_payments set total_amount = p_total, other_amount = v_other, other_method = case when v_other > 0 then v_method end
   where id = p.id returning * into p;
  return p;
end $$;

create or replace function sh_shop_trial_price(p_package_id bigint, p_price integer, p_other_method text)
returns json language plpgsql set search_path = public as $$
declare v_pkg sh_shop_trial_packages; v_pay sh_shop_payments;
begin
  if p_price is null or p_price < 0 then raise exception 'INVALID_AMOUNT'; end if;
  select * into v_pkg from sh_shop_trial_packages where id = p_package_id for update;
  if not found then raise exception 'PACKAGE_NOT_FOUND'; end if;
  if v_pkg.status <> 'active' then raise exception 'PACKAGE_CANCELLED'; end if;
  if exists (select 1 from sh_shop_payments where id = v_pkg.payment_id and status = 'paid') then
    select * into v_pay from sh_shop_payment_adjust(v_pkg.payment_id, p_price, p_other_method);
  end if;
  update sh_shop_trial_packages set price = p_price where id = v_pkg.id returning * into v_pkg;
  return json_build_object('package', row_to_json(v_pkg), 'payment', case when v_pay.id is null then null else row_to_json(v_pay) end);
end $$;

revoke all on function sh_shop_trial_use(bigint, text, text, text, bigint) from public, anon, authenticated;
revoke all on function sh_shop_payment_adjust(bigint, integer, text) from public, anon, authenticated;
revoke all on function sh_shop_trial_price(bigint, integer, text) from public, anon, authenticated;
grant execute on function sh_shop_trial_use(bigint, text, text, text, bigint) to service_role;
grant execute on function sh_shop_payment_adjust(bigint, integer, text) to service_role;
grant execute on function sh_shop_trial_price(bigint, integer, text) to service_role;
