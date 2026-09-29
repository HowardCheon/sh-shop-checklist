create sequence if not exists public."EST_TB_BANK_BANK_CD_seq";

create sequence if not exists public."EST_TB_LIMIT_NO_seq";

create sequence if not exists public."EST_TB_WHAT_NO_seq";

create sequence if not exists public."EST_TB_WHERE_NO_seq";

create sequence if not exists public."EST_TN_LIST_NO_seq";

create sequence if not exists public."TB_APP_FILTER_NO_seq";

create sequence if not exists public."TB_BANK_BANK_CD_seq";

create sequence if not exists public."TB_CARD_NO_seq";

create sequence if not exists public."TB_LIMIT_NO_seq";

create sequence if not exists public."TB_LOCATION_NO_seq";

create sequence if not exists public."TB_RECURRING_NO_seq";

create sequence if not exists public."TB_WHAT_NO_seq";

create sequence if not exists public."TB_WHERE_NO_seq";

create sequence if not exists public."TB_WHO_NO_seq";

create sequence if not exists public."TN_LIST_NO_seq";

create sequence if not exists public."six_list_NO_seq";

create sequence if not exists public."six_list_place_NO_seq";

create sequence if not exists public."six_member_user_no_seq";

create sequence if not exists public."tb_notify_raw_no_seq";

create table public."TB_AUTH" (
  "KEY_NM" text not null,
  "PW_HASH" text not null,
  "PW_SALT" text not null,
  "UPDT_DTM" timestamp without time zone default (now() AT TIME ZONE 'Asia/Seoul'::text)
);

create table public."TB_BANK" (
  "BANK_CD" integer default nextval('"TB_BANK_BANK_CD_seq"'::regclass) not null,
  "USE_CNT" numeric(10,0) default '0'::numeric not null,
  "BANK_NM" character varying(30) not null,
  "INST_DTM" timestamp without time zone not null,
  "INST_ID" character varying(50) not null,
  "UPDT_DTM" timestamp without time zone,
  "UPDT_ID" character varying(50) default NULL::character varying
);

create table public."TB_BANK_SUB" (
  "BANK_CD" integer not null,
  "BANK_SUB" integer not null,
  "BANK_SUB_NM" character varying(50) not null,
  "USE_CNT" integer default 0 not null,
  "INST_DTM" timestamp without time zone not null,
  "INST_ID" character varying(30) not null,
  "UPDT_DTM" timestamp without time zone not null,
  "UPDT_ID" character varying(30) not null
);

create table public."TB_WHERE" (
  "NO" integer default nextval('"TB_WHERE_NO_seq"'::regclass) not null,
  "WHERE_NM" character varying(50) not null,
  "USE_CNT" numeric(10,0) default '0'::numeric not null,
  "INST_DTM" timestamp without time zone not null,
  "INST_ID" character varying(50) not null,
  "UPDT_DTM" timestamp without time zone,
  "UPDT_ID" character varying(50) default NULL::character varying
);

create table public."TB_WHAT" (
  "NO" integer default nextval('"TB_WHAT_NO_seq"'::regclass) not null,
  "WHAT_NM" character varying(30) not null,
  "USE_CNT" integer default 0 not null,
  "INST_DTM" timestamp without time zone not null,
  "INST_ID" character varying(50) not null,
  "UPDT_DTM" timestamp without time zone not null,
  "UPDT_ID" character varying(50) not null
);

create table public."TB_WHO" (
  "NO" integer default nextval('"TB_WHO_NO_seq"'::regclass) not null,
  "WHO_NM" character varying(30) not null,
  "EMAIL" character varying(100) default NULL::character varying,
  "PHONE_NO" character varying(15) default NULL::character varying,
  "INST_DTM" timestamp without time zone,
  "INST_ID" character varying(50) default NULL::character varying,
  "CONN_DTM" timestamp without time zone
);

create table public."TB_LIMIT" (
  "NO" integer default nextval('"TB_LIMIT_NO_seq"'::regclass) not null,
  "LIMIT_AMT" integer not null,
  "FROM_YM" character varying(6) not null,
  "INST_DTM" timestamp without time zone not null,
  "INST_ID" character varying(50) not null,
  "UPDT_DTM" timestamp without time zone,
  "UPDT_ID" character varying(50) default NULL::character varying
);

create table public."TB_CARD" (
  "NO" integer default nextval('"TB_CARD_NO_seq"'::regclass) not null,
  "CARD_NM" character varying not null,
  "MEMO" text,
  "BENEFIT" character varying,
  "SORT_NO" integer default 0 not null,
  "INST_DTM" timestamp without time zone default (now() AT TIME ZONE 'Asia/Seoul'::text) not null,
  "INST_ID" character varying,
  "UPDT_DTM" timestamp without time zone,
  "UPDT_ID" character varying
);

create table public."TB_RECURRING" (
  "NO" integer default nextval('"TB_RECURRING_NO_seq"'::regclass) not null,
  "RECUR_NM" character varying not null,
  "RECUR_TYPE" character varying(1) not null,
  "AMT" integer,
  "WHAT_NO" integer not null,
  "WHERE_NO" integer,
  "WHO_NO" integer,
  "BANK_CD" integer,
  "BANK_SUB" integer,
  "PAY_DAY" integer,
  "USE_YN" character varying(1) default 'Y'::character varying not null,
  "SORT_NO" integer default 0 not null,
  "INST_DTM" timestamp without time zone default now() not null,
  "INST_ID" character varying,
  "UPDT_DTM" timestamp without time zone,
  "UPDT_ID" character varying,
  "MEMO" character varying,
  "RECUR_CAT" character varying
);

create table public."TN_LIST" (
  "NO" integer default nextval('"TN_LIST_NO_seq"'::regclass) not null,
  "USE_YMD" character varying(8) not null,
  "AMT" integer not null,
  "WHO_NO" integer not null,
  "BANK_CD" integer not null,
  "BANK_SUB" integer default 0,
  "WHERE_NO" integer not null,
  "WHAT_NO" integer not null,
  "EX_MONEY" integer default 0,
  "MEMO" character varying(200) default NULL::character varying,
  "INST_DTM" timestamp without time zone not null,
  "INST_ID" character varying(50) not null,
  "UPDT_DTM" timestamp without time zone,
  "UPDT_ID" character varying(50) default NULL::character varying,
  "END_YN" character varying(1) default 'N'::character varying not null,
  "DEL_YN" character varying(1) default 'N'::character varying not null,
  "CNCL_YN" character varying(1) default 'N'::character varying,
  "AUTO_YN" character varying(1) default 'N'::character varying,
  "RECUR_NO" integer,
  "IO_TYPE" character varying(1) default 'O'::character varying not null
);

create table public."EST_TB_BANK" (
  "BANK_CD" integer default nextval('"EST_TB_BANK_BANK_CD_seq"'::regclass) not null,
  "USE_CNT" numeric(10,0) default 0 not null,
  "BANK_NM" character varying(30) not null,
  "INST_DTM" timestamp without time zone default (now() AT TIME ZONE 'Asia/Seoul'::text) not null,
  "INST_ID" character varying(50) default 'system'::character varying not null,
  "UPDT_DTM" timestamp without time zone,
  "UPDT_ID" character varying(50) default NULL::character varying
);

create table public."EST_TB_BANK_SUB" (
  "BANK_CD" integer not null,
  "BANK_SUB" integer not null,
  "BANK_SUB_NM" character varying(50) not null,
  "USE_CNT" integer default 0 not null,
  "INST_DTM" timestamp without time zone default (now() AT TIME ZONE 'Asia/Seoul'::text) not null,
  "INST_ID" character varying(30) default 'system'::character varying not null,
  "UPDT_DTM" timestamp without time zone default (now() AT TIME ZONE 'Asia/Seoul'::text) not null,
  "UPDT_ID" character varying(30) default 'system'::character varying not null
);

create table public."EST_TB_WHERE" (
  "NO" integer default nextval('"EST_TB_WHERE_NO_seq"'::regclass) not null,
  "WHERE_NM" character varying(50) not null,
  "USE_CNT" numeric(10,0) default 0 not null,
  "INST_DTM" timestamp without time zone default (now() AT TIME ZONE 'Asia/Seoul'::text) not null,
  "INST_ID" character varying(50) default 'system'::character varying not null,
  "UPDT_DTM" timestamp without time zone,
  "UPDT_ID" character varying(50) default NULL::character varying
);

create table public."EST_TB_WHAT" (
  "NO" integer default nextval('"EST_TB_WHAT_NO_seq"'::regclass) not null,
  "WHAT_NM" character varying(30) not null,
  "USE_CNT" integer default 0 not null,
  "INST_DTM" timestamp without time zone default (now() AT TIME ZONE 'Asia/Seoul'::text) not null,
  "INST_ID" character varying(50) default 'system'::character varying not null,
  "UPDT_DTM" timestamp without time zone default (now() AT TIME ZONE 'Asia/Seoul'::text) not null,
  "UPDT_ID" character varying(50) default 'system'::character varying not null,
  "IO_TYPE" character varying(1) default 'O'::character varying not null
);

create table public."EST_TB_LIMIT" (
  "NO" integer default nextval('"EST_TB_LIMIT_NO_seq"'::regclass) not null,
  "LIMIT_AMT" integer not null,
  "FROM_YM" character varying(6) not null,
  "INST_DTM" timestamp without time zone default (now() AT TIME ZONE 'Asia/Seoul'::text) not null,
  "INST_ID" character varying(50) default 'system'::character varying not null,
  "UPDT_DTM" timestamp without time zone,
  "UPDT_ID" character varying(50) default NULL::character varying
);

create table public."EST_TN_LIST" (
  "NO" integer default nextval('"EST_TN_LIST_NO_seq"'::regclass) not null,
  "USE_YMD" character varying(8) not null,
  "AMT" integer not null,
  "WHO_NO" integer default 1 not null,
  "BANK_CD" integer not null,
  "BANK_SUB" integer default 0,
  "WHERE_NO" integer not null,
  "WHAT_NO" integer not null,
  "EX_MONEY" integer default 0,
  "MEMO" character varying(200) default NULL::character varying,
  "INST_DTM" timestamp without time zone default (now() AT TIME ZONE 'Asia/Seoul'::text) not null,
  "INST_ID" character varying(50) default 'system'::character varying not null,
  "UPDT_DTM" timestamp without time zone,
  "UPDT_ID" character varying(50) default NULL::character varying,
  "END_YN" character varying(1) default 'N'::character varying not null,
  "DEL_YN" character varying(1) default 'N'::character varying not null,
  "CNCL_YN" character varying(1) default 'N'::character varying,
  "AUTO_YN" character varying(1) default 'N'::character varying,
  "RECUR_NO" integer,
  "IO_TYPE" character varying(1) default 'O'::character varying not null
);

create table public."TB_LOCATION" (
  "NO" integer default nextval('"TB_LOCATION_NO_seq"'::regclass) not null,
  "PHONE_NO" character varying(50) not null,
  "LAT" double precision not null,
  "LNG" double precision not null,
  "ACCURACY" double precision default 0,
  "INST_DTM" timestamp without time zone default now(),
  "IP" character varying(50)
);

create table public."MSG_LIST" (
  "INST_DTM" timestamp without time zone not null,
  "NO" integer not null,
  "MSG_TYPE" character varying(4) not null,
  "FROM_PHONE_NO" character varying(50) default NULL::character varying,
  "TO_PHONE_NO" character varying(50) default NULL::character varying,
  "APP_NM" character varying(50) default NULL::character varying,
  "TITLE" character varying(50) default NULL::character varying,
  "MSG" character varying(1000) default NULL::character varying
);

create table public."TB_APP_FILTER" (
  "NO" integer default nextval('"TB_APP_FILTER_NO_seq"'::regclass) not null,
  "FILTER_NM" character varying(100) not null,
  "USE_YN" character(1) default 'Y'::bpchar,
  "INST_DTM" timestamp without time zone default now()
);

create table public."tb_notify_raw" (
  "no" integer default nextval('tb_notify_raw_no_seq'::regclass) not null,
  "app_nm" character varying(200),
  "title" character varying(500),
  "msg" character varying(2000),
  "parsed_yn" character(1) default 'N'::bpchar,
  "inst_dtm" timestamp without time zone default now()
);

create table public."six_member" (
  "user_no" bigint default nextval('six_member_user_no_seq'::regclass) not null,
  "user_id" character varying(100) not null,
  "user_nm" character varying(100) default NULL::character varying,
  "phone_no" character varying(100) default NULL::character varying,
  "email" character varying(200) default NULL::character varying,
  "token" character varying(1000) default NULL::character varying,
  "reg_dtm" timestamp without time zone,
  "reg_ip" character varying(50) default NULL::character varying,
  "updt_dtm" timestamp without time zone,
  "updt_ip" character varying(50) default NULL::character varying,
  "google_key" character varying(1000) default NULL::character varying,
  "fs_key" character varying(512) default NULL::character varying,
  "sex" character varying(1) default NULL::character varying,
  "birth_year" character varying(4) default NULL::character varying
);

create table public."six_list" (
  "no" bigint default nextval('"six_list_NO_seq"'::regclass) not null,
  "start_dtm" timestamp without time zone not null,
  "end_dtm" timestamp without time zone,
  "place_no" bigint,
  "distance" integer default 0 not null,
  "do_do" character varying(200) default NULL::character varying,
  "do_what" character varying(200) default NULL::character varying,
  "do_for" character varying(200) default NULL::character varying,
  "who_no" bigint,
  "img" character varying(200) default NULL::character varying,
  "feel" character varying(2) default NULL::character varying,
  "memo" character varying(10000) default NULL::character varying,
  "like_cnt" integer default 0 not null,
  "comment_cnt" integer default 0 not null,
  "reg_dtm" timestamp without time zone,
  "reg_ip" character varying(20) default NULL::character varying,
  "updt_dtm" timestamp without time zone,
  "updt_ip" character varying(20) default NULL::character varying,
  "user_id" character varying(100) default NULL::character varying,
  "google_cal_id" character varying(200) default NULL::character varying,
  "short_url" character varying(200) default NULL::character varying,
  "lang_cd" character varying(50) default NULL::character varying,
  "tz_cd" character varying(50) default NULL::character varying
);

create table public."six_list_place" (
  "no" bigint default nextval('"six_list_place_NO_seq"'::regclass) not null,
  "fs_id" character varying(100) default NULL::character varying,
  "fs_nm" character varying(200) default NULL::character varying,
  "new_yn" character varying(1) default 'N'::character varying,
  "lat" character varying(32) default NULL::character varying,
  "lng" character varying(32) default NULL::character varying,
  "cc" character varying(32) default NULL::character varying,
  "country" character varying(200) default NULL::character varying,
  "state" character varying(200) default NULL::character varying,
  "city" character varying(200) default NULL::character varying,
  "addr" character varying(200) default NULL::character varying,
  "contact" character varying(200) default NULL::character varying,
  "cat_id" character varying(100) default NULL::character varying,
  "cat_nm" character varying(200) default NULL::character varying,
  "cat_icon_url" character varying(500) default NULL::character varying,
  "reg_dtm" date,
  "updt_dtm" date,
  "user_id" character varying(200) default NULL::character varying
);

create table public."six_list_who" (
  "no" bigint not null,
  "no_seq" integer default 0 not null,
  "phone_id" character varying(100) default NULL::character varying,
  "phone_nm" character varying(200) default NULL::character varying,
  "phone_no" character varying(32) default NULL::character varying,
  "phone_img" character varying(200) default NULL::character varying,
  "reg_dtm" date
);

alter sequence public."EST_TB_BANK_BANK_CD_seq" owned by public."EST_TB_BANK"."BANK_CD";

alter sequence public."EST_TB_LIMIT_NO_seq" owned by public."EST_TB_LIMIT"."NO";

alter sequence public."EST_TB_WHAT_NO_seq" owned by public."EST_TB_WHAT"."NO";

alter sequence public."EST_TB_WHERE_NO_seq" owned by public."EST_TB_WHERE"."NO";

alter sequence public."EST_TN_LIST_NO_seq" owned by public."EST_TN_LIST"."NO";

alter sequence public."TB_APP_FILTER_NO_seq" owned by public."TB_APP_FILTER"."NO";

alter sequence public."TB_BANK_BANK_CD_seq" owned by public."TB_BANK"."BANK_CD";

alter sequence public."TB_CARD_NO_seq" owned by public."TB_CARD"."NO";

alter sequence public."TB_LIMIT_NO_seq" owned by public."TB_LIMIT"."NO";

alter sequence public."TB_LOCATION_NO_seq" owned by public."TB_LOCATION"."NO";

alter sequence public."TB_RECURRING_NO_seq" owned by public."TB_RECURRING"."NO";

alter sequence public."TB_WHAT_NO_seq" owned by public."TB_WHAT"."NO";

alter sequence public."TB_WHERE_NO_seq" owned by public."TB_WHERE"."NO";

alter sequence public."TB_WHO_NO_seq" owned by public."TB_WHO"."NO";

alter sequence public."TN_LIST_NO_seq" owned by public."TN_LIST"."NO";

alter sequence public."six_list_NO_seq" owned by public."six_list"."no";

alter sequence public."six_list_place_NO_seq" owned by public."six_list_place"."no";

alter sequence public."six_member_user_no_seq" owned by public."six_member"."user_no";

alter sequence public."tb_notify_raw_no_seq" owned by public."tb_notify_raw"."no";

alter table public."EST_TB_BANK_SUB" add constraint "EST_TB_BANK_SUB_pkey" PRIMARY KEY ("BANK_CD", "BANK_SUB");

alter table public."EST_TB_BANK" add constraint "EST_TB_BANK_pkey" PRIMARY KEY ("BANK_CD");

alter table public."EST_TB_LIMIT" add constraint "EST_TB_LIMIT_pkey" PRIMARY KEY ("NO");

alter table public."EST_TB_WHAT" add constraint "EST_TB_WHAT_pkey" PRIMARY KEY ("NO");

alter table public."EST_TB_WHERE" add constraint "EST_TB_WHERE_pkey" PRIMARY KEY ("NO");

alter table public."EST_TN_LIST" add constraint "EST_TN_LIST_pkey" PRIMARY KEY ("NO");

alter table public."MSG_LIST" add constraint "MSG_LIST_pkey" PRIMARY KEY ("NO");

alter table public."TB_APP_FILTER" add constraint "TB_APP_FILTER_pkey" PRIMARY KEY ("NO");

alter table public."TB_AUTH" add constraint "TB_AUTH_pkey" PRIMARY KEY ("KEY_NM");

alter table public."TB_BANK_SUB" add constraint "TB_BANK_SUB_pkey" PRIMARY KEY ("BANK_CD", "BANK_SUB");

alter table public."TB_BANK" add constraint "TB_BANK_pkey" PRIMARY KEY ("BANK_CD");

alter table public."TB_CARD" add constraint "TB_CARD_pkey" PRIMARY KEY ("NO");

alter table public."TB_LIMIT" add constraint "TB_LIMIT_pkey" PRIMARY KEY ("NO");

alter table public."TB_LOCATION" add constraint "TB_LOCATION_pkey" PRIMARY KEY ("NO");

alter table public."TB_RECURRING" add constraint "TB_RECURRING_RECUR_CAT_check" CHECK ((("RECUR_CAT" IS NULL) OR (("RECUR_CAT")::text = ANY ((ARRAY['용돈'::character varying, '보험'::character varying, '저축'::character varying, '회비'::character varying, '통신요금'::character varying, '교육'::character varying, '기타'::character varying])::text[]))));

alter table public."TB_RECURRING" add constraint "TB_RECURRING_RECUR_TYPE_check" CHECK ((("RECUR_TYPE")::text = ANY ((ARRAY['F'::character varying, 'V'::character varying])::text[])));

alter table public."TB_RECURRING" add constraint "TB_RECURRING_pkey" PRIMARY KEY ("NO");

alter table public."TB_WHAT" add constraint "TB_WHAT_pkey" PRIMARY KEY ("NO");

alter table public."TB_WHERE" add constraint "TB_WHERE_pkey" PRIMARY KEY ("NO");

alter table public."TB_WHO" add constraint "TB_WHO_pkey" PRIMARY KEY ("NO");

alter table public."TN_LIST" add constraint "TN_LIST_pkey" PRIMARY KEY ("NO");

alter table public."six_member" add constraint "six_member_pkey" PRIMARY KEY (user_no);

alter table public."tb_notify_raw" add constraint "tb_notify_raw_pkey" PRIMARY KEY (no);

alter table public."TB_RECURRING" add constraint "TB_RECURRING_BANK_CD_fkey" FOREIGN KEY ("BANK_CD") REFERENCES "TB_BANK"("BANK_CD");

alter table public."TB_RECURRING" add constraint "TB_RECURRING_WHAT_NO_fkey" FOREIGN KEY ("WHAT_NO") REFERENCES "TB_WHAT"("NO");

alter table public."TB_RECURRING" add constraint "TB_RECURRING_WHERE_NO_fkey" FOREIGN KEY ("WHERE_NO") REFERENCES "TB_WHERE"("NO");

alter table public."TB_RECURRING" add constraint "TB_RECURRING_WHO_NO_fkey" FOREIGN KEY ("WHO_NO") REFERENCES "TB_WHO"("NO");

alter table public."TN_LIST" add constraint "TN_LIST_RECUR_NO_fkey" FOREIGN KEY ("RECUR_NO") REFERENCES "TB_RECURRING"("NO");

CREATE INDEX idx_est_tn_list_use_ymd ON public."EST_TN_LIST" USING btree ("USE_YMD");

CREATE INDEX idx_location_phone_dtm ON public."TB_LOCATION" USING btree ("PHONE_NO", "INST_DTM");

CREATE INDEX idx_tn_list_recur_no ON public."TN_LIST" USING btree ("RECUR_NO");

CREATE INDEX idx_tn_list_use_ymd ON public."TN_LIST" USING btree ("USE_YMD");

CREATE INDEX "six_list_IDX_SIX_LIST_01" ON public.six_list USING btree (user_id);

CREATE UNIQUE INDEX "six_list_place_NO" ON public.six_list_place USING btree (no);

CREATE UNIQUE INDEX "six_list_who_NO" ON public.six_list_who USING btree (no, no_seq);

CREATE INDEX "six_member_IDX_SIX_MEMBER_01" ON public.six_member USING btree (email);

CREATE INDEX "six_member_IDX_SIX_MEMBER_02" ON public.six_member USING btree (user_id);

alter table public."tb_notify_raw" enable row level security;

alter table public."TB_BANK_SUB" enable row level security;

alter table public."TB_LIMIT" enable row level security;

alter table public."TB_APP_FILTER" enable row level security;

alter table public."six_list" enable row level security;

alter table public."six_member" enable row level security;

alter table public."TB_WHERE" enable row level security;

alter table public."TB_WHO" enable row level security;

alter table public."TN_LIST" enable row level security;

alter table public."TB_LOCATION" enable row level security;

alter table public."MSG_LIST" enable row level security;

alter table public."six_list_place" enable row level security;

alter table public."TB_BANK" enable row level security;

alter table public."six_list_who" enable row level security;

alter table public."TB_RECURRING" enable row level security;

alter table public."TB_WHAT" enable row level security;

alter table public."TB_AUTH" enable row level security;

alter table public."EST_TB_BANK" enable row level security;

alter table public."EST_TB_BANK_SUB" enable row level security;

alter table public."EST_TB_WHERE" enable row level security;

alter table public."EST_TB_WHAT" enable row level security;

alter table public."EST_TB_LIMIT" enable row level security;

alter table public."EST_TN_LIST" enable row level security;

alter table public."TB_CARD" enable row level security;

create policy "Deny anon access" on public."EST_TB_BANK" as permissive for all to "anon" using (false);

create policy "Deny authenticated access" on public."EST_TB_BANK" as permissive for all to "authenticated" using (false);

create policy "Deny anon access" on public."EST_TB_BANK_SUB" as permissive for all to "anon" using (false);

create policy "Deny authenticated access" on public."EST_TB_BANK_SUB" as permissive for all to "authenticated" using (false);

create policy "Deny anon access" on public."EST_TB_LIMIT" as permissive for all to "anon" using (false);

create policy "Deny authenticated access" on public."EST_TB_LIMIT" as permissive for all to "authenticated" using (false);

create policy "Deny anon access" on public."EST_TB_WHAT" as permissive for all to "anon" using (false);

create policy "Deny authenticated access" on public."EST_TB_WHAT" as permissive for all to "authenticated" using (false);

create policy "Deny anon access" on public."EST_TB_WHERE" as permissive for all to "anon" using (false);

create policy "Deny authenticated access" on public."EST_TB_WHERE" as permissive for all to "authenticated" using (false);

create policy "Deny anon access" on public."EST_TN_LIST" as permissive for all to "anon" using (false);

create policy "Deny authenticated access" on public."EST_TN_LIST" as permissive for all to "authenticated" using (false);

create policy "Deny anon access" on public."MSG_LIST" as permissive for all to "anon" using (false);

create policy "Deny authenticated access" on public."MSG_LIST" as permissive for all to "authenticated" using (false);

create policy "Deny anon access" on public."TB_APP_FILTER" as permissive for all to "anon" using (false);

create policy "Deny authenticated access" on public."TB_APP_FILTER" as permissive for all to "authenticated" using (false);

create policy "Deny anon access" on public."TB_BANK" as permissive for all to "anon" using (false);

create policy "Deny authenticated access" on public."TB_BANK" as permissive for all to "authenticated" using (false);

create policy "Deny anon access" on public."TB_BANK_SUB" as permissive for all to "anon" using (false);

create policy "Deny authenticated access" on public."TB_BANK_SUB" as permissive for all to "authenticated" using (false);

create policy "Deny anon access" on public."TB_LIMIT" as permissive for all to "anon" using (false);

create policy "Deny authenticated access" on public."TB_LIMIT" as permissive for all to "authenticated" using (false);

create policy "Deny anon access" on public."TB_LOCATION" as permissive for all to "anon" using (false);

create policy "Deny authenticated access" on public."TB_LOCATION" as permissive for all to "authenticated" using (false);

create policy "Deny anon access" on public."TB_WHAT" as permissive for all to "anon" using (false);

create policy "Deny authenticated access" on public."TB_WHAT" as permissive for all to "authenticated" using (false);

create policy "Deny anon access" on public."TB_WHERE" as permissive for all to "anon" using (false);

create policy "Deny authenticated access" on public."TB_WHERE" as permissive for all to "authenticated" using (false);

create policy "Deny anon access" on public."TB_WHO" as permissive for all to "anon" using (false);

create policy "Deny authenticated access" on public."TB_WHO" as permissive for all to "authenticated" using (false);

create policy "Deny anon access" on public."TN_LIST" as permissive for all to "anon" using (false);

create policy "Deny authenticated access" on public."TN_LIST" as permissive for all to "authenticated" using (false);

create policy "Deny anon access" on public."six_list" as permissive for all to "anon" using (false);

create policy "Deny authenticated access" on public."six_list" as permissive for all to "authenticated" using (false);

create policy "Deny anon access" on public."six_list_place" as permissive for all to "anon" using (false);

create policy "Deny authenticated access" on public."six_list_place" as permissive for all to "authenticated" using (false);

create policy "Deny anon access" on public."six_list_who" as permissive for all to "anon" using (false);

create policy "Deny authenticated access" on public."six_list_who" as permissive for all to "authenticated" using (false);

create policy "Deny anon access" on public."six_member" as permissive for all to "anon" using (false);

create policy "Deny authenticated access" on public."six_member" as permissive for all to "authenticated" using (false);

create policy "Deny anon access" on public."tb_notify_raw" as permissive for all to "anon" using (false);

create policy "Deny authenticated access" on public."tb_notify_raw" as permissive for all to "authenticated" using (false);