-- 고객 요청사항과 관리자 내부 메모 분리 (2026-10-06)
-- customer_message: 외부(홈페이지) 예약 시 고객이 남긴 요청사항 — 고객 조회에 노출
-- memo: 관리자 내부 메모 — 관리자 화면에서만 노출
alter table sh_shop_reservations add column if not exists customer_message text;
