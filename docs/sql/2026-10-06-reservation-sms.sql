-- 예약 확정·전일 안내 문자 발송 기록 (2026-10-06)
-- *_sms_start_at: 발송 당시 예약 시작 시각 — 이후 예약 시간이 바뀌면 재발송 필요로 표시
alter table sh_shop_reservations add column if not exists confirm_sms_at timestamptz;
alter table sh_shop_reservations add column if not exists confirm_sms_start_at timestamptz;
alter table sh_shop_reservations add column if not exists remind_sms_at timestamptz;
alter table sh_shop_reservations add column if not exists remind_sms_start_at timestamptz;
