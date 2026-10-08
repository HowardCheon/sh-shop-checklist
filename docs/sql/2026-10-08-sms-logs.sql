-- 예약 문자(확정·전일 안내) 발송 기록 (2026-10-08) — 성공·실패 모두, 인증번호 문자는 제외
create table if not exists sh_shop_sms_logs (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('confirm', 'remind')),
  reservation_id bigint references sh_shop_reservations(id) on delete set null,
  customer_name text,
  phone text not null,
  text text not null,
  status text not null check (status in ('sent', 'failed')),
  reason text,
  created_at timestamptz not null default now()
);
-- 관리자 화면: 최신순 100건 → 역순 인덱스로 앞쪽만 읽음
create index if not exists sh_shop_sms_logs_created_idx on sh_shop_sms_logs(created_at desc);
create index if not exists sh_shop_sms_logs_reservation_idx on sh_shop_sms_logs(reservation_id) where reservation_id is not null;
alter table sh_shop_sms_logs enable row level security;

-- 기존 발송분(예약 이력의 성공 기록) 채우기 — 문구는 당시 예약 시각 기준으로 다시 생성
insert into sh_shop_sms_logs (kind, reservation_id, customer_name, phone, text, status, created_at)
select
  k.kind, r.id, r.customer_name, r.customer_phone,
  case k.kind
    when 'confirm' then '[온:플로우]' || chr(10) || r.customer_name || '님, '
      || extract(month from t.ts)::int || '/' || extract(day from t.ts)::int
      || '(' || (array['일','월','화','수','목','금','토'])[extract(dow from t.ts)::int + 1] || ') '
      || t.ampm || t.h12 || ':' || lpad(extract(minute from t.ts)::int::text, 2, '0') || ' 예약확정되었습니다. 감사합니다.'
    else '[온:플로우]' || chr(10) || r.customer_name || ' 고객님 안녕하세요 ^^ 내일 '
      || t.ampm || t.h12 || '시' || case when extract(minute from t.ts) > 0 then extract(minute from t.ts)::int || '분' else '' end
      || '에 뵙겠습니다 ♡'
  end,
  'sent', h.changed_at
from sh_shop_reservation_history h
join sh_shop_reservations r on r.id = h.reservation_id
cross join lateral (select case when h.description like '확정%' then 'confirm' else 'remind' end as kind) k
cross join lateral (select to_timestamp(substring(h.description from '\((\d{4}-\d{2}-\d{2} \d{2}:\d{2}) 기준\)'), 'YYYY-MM-DD HH24:MI') as ts) t0
cross join lateral (select t0.ts as ts,
  case when extract(hour from t0.ts) < 12 then '오전' else '오후' end as ampm,
  case when extract(hour from t0.ts)::int % 12 = 0 then 12 else extract(hour from t0.ts)::int % 12 end as h12) t
where h.action = 'sms' and r.customer_phone is not null
  and not exists (select 1 from sh_shop_sms_logs l where l.reservation_id = r.id and l.created_at = h.changed_at);
