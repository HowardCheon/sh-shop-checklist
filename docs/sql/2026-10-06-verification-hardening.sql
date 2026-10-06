-- SMS 인증 보안 강화 (2026-10-06)
-- 1) 발송 제한(재발송 간격·번호별·IP별·전체)을 잠금 안에서 한 번에 검사 → 동시 요청으로 우회 불가
-- 2) 오입력 횟수를 비교 전에 원자적으로 증가 → 동시 오답으로 5회 제한 우회 불가

alter table sh_shop_phone_verifications add column if not exists ip text;
create index if not exists sh_shop_phone_verifications_ip_idx on sh_shop_phone_verifications(ip, created_at desc) where ip is not null;
create index if not exists sh_shop_phone_verifications_created_idx on sh_shop_phone_verifications(created_at desc);

create or replace function sh_shop_verification_create(
  p_phone text, p_ip text, p_code_hash text, p_ttl_sec integer,
  p_resend_gap_sec integer, p_max_per_hour integer, p_max_per_ip_hour integer, p_max_per_day integer
) returns void language plpgsql set search_path = public as $$
declare
  v_last timestamptz;
  v_cnt integer;
begin
  -- 잠금 순서 고정(IP → 번호)으로 교착 방지
  if p_ip is not null then perform pg_advisory_xact_lock(hashtext('verify-ip:' || p_ip)); end if;
  perform pg_advisory_xact_lock(hashtext('verify-phone:' || p_phone));

  select max(created_at), count(*) into v_last, v_cnt
    from sh_shop_phone_verifications where phone = p_phone and created_at > now() - interval '1 hour';
  if v_last is not null and v_last > now() - make_interval(secs => p_resend_gap_sec) then raise exception 'RESEND_TOO_SOON'; end if;
  if v_cnt >= p_max_per_hour then raise exception 'PHONE_HOURLY_LIMIT'; end if;
  if p_ip is not null and (select count(*) from sh_shop_phone_verifications where ip = p_ip and created_at > now() - interval '1 hour') >= p_max_per_ip_hour then
    raise exception 'IP_HOURLY_LIMIT';
  end if;
  if (select count(*) from sh_shop_phone_verifications where created_at > now() - interval '1 day') >= p_max_per_day then
    raise exception 'DAILY_LIMIT';
  end if;

  insert into sh_shop_phone_verifications (phone, ip, code_hash, expires_at)
  values (p_phone, p_ip, p_code_hash, now() + make_interval(secs => p_ttl_sec));
end $$;

-- 오입력 1회 차감 — 남은 횟수가 없거나 이미 인증됐으면 null
create or replace function sh_shop_verification_attempt(p_id bigint, p_max integer)
returns integer language sql set search_path = public as $$
  update sh_shop_phone_verifications set attempts = attempts + 1
   where id = p_id and attempts < p_max and verified_at is null
  returning attempts
$$;

revoke all on function sh_shop_verification_create(text, text, text, integer, integer, integer, integer, integer) from public, anon, authenticated;
revoke all on function sh_shop_verification_attempt(bigint, integer) from public, anon, authenticated;
grant execute on function sh_shop_verification_create(text, text, text, integer, integer, integer, integer, integer) to service_role;
grant execute on function sh_shop_verification_attempt(bigint, integer) to service_role;
