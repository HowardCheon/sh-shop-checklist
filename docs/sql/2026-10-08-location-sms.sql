-- 위치 안내 문자 (2026-10-08) — 예약 시간과 무관, 발송 시각만 기록
alter table sh_shop_reservations add column if not exists location_sms_at timestamptz;
alter table sh_shop_sms_logs drop constraint if exists sh_shop_sms_logs_kind_check;
alter table sh_shop_sms_logs add constraint sh_shop_sms_logs_kind_check check (kind in ('confirm', 'remind', 'location'));
