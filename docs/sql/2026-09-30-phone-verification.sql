-- 휴대폰 SMS 본인 인증 (2026-09-30)
-- 인증번호·토큰은 해시만 저장
create table if not exists sh_shop_phone_verifications (
  id bigint generated always as identity primary key,
  phone text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  verified_at timestamptz,
  token_hash text,
  token_expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists sh_shop_phone_verifications_phone_idx on sh_shop_phone_verifications(phone, created_at desc);
create index if not exists sh_shop_phone_verifications_token_idx on sh_shop_phone_verifications(token_hash) where token_hash is not null;
alter table sh_shop_phone_verifications enable row level security;
