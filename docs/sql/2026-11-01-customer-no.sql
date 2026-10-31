-- 고객번호: 기존 고객은 등록순(created_at, id)으로 1번부터, 새 고객은 시퀀스로 자동 이어 붙임
-- 고객을 삭제·병합해도 번호는 재사용하지 않음(빈 번호 생김)
create sequence if not exists sh_shop_customer_no_seq;

alter table sh_shop_customers add column if not exists customer_no integer;

with o as (
  select id, row_number() over (order by created_at, id) as n
  from sh_shop_customers
)
update sh_shop_customers c set customer_no = o.n
from o where c.id = o.id and c.customer_no is null;

select setval('sh_shop_customer_no_seq', coalesce((select max(customer_no) from sh_shop_customers), 0) + 1, false);

alter table sh_shop_customers
  alter column customer_no set default nextval('sh_shop_customer_no_seq'),
  alter column customer_no set not null;
alter sequence sh_shop_customer_no_seq owned by sh_shop_customers.customer_no;
create unique index if not exists sh_shop_customers_customer_no_key on sh_shop_customers (customer_no);
