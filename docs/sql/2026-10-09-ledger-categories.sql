-- 샵 가계부 항목 정리 (2026-10-09) — 지출 12개 → 7개, 수입은 제품 판매·기타 수입만 노출
-- 합치는 항목의 내역은 대표 항목으로 옮긴 뒤 삭제. 여러 번 실행해도 안전
begin;

create temp table merge_map (io text, from_name text, to_name text) on commit drop;
insert into merge_map values
  ('out', '재료비', '재료·소모품'), ('out', '소모품', '재료·소모품'), ('out', '제품 매입', '재료·소모품'),
  ('out', '임대료', '임대·관리비'), ('out', '관리비·공과금', '임대·관리비'), ('out', '통신비', '임대·관리비'),
  ('out', '카드 수수료', '수수료·세금'), ('out', '세금·보험', '수수료·세금');

insert into sh_shop_ledger_categories (io, name)
select distinct io, to_name from merge_map
on conflict (io, name) do nothing;

update sh_shop_ledger_entries e set category_id = t.id, updated_at = now()
from merge_map m
join sh_shop_ledger_categories f on f.io = m.io and f.name = m.from_name
join sh_shop_ledger_categories t on t.io = m.io and t.name = m.to_name
where e.category_id = f.id;

delete from sh_shop_ledger_categories c using merge_map m
where c.io = m.io and c.name = m.from_name;

update sh_shop_ledger_categories c set sort = v.sort, hidden = v.hidden
from (values
  ('out', '재료·소모품', 1, false), ('out', '임대·관리비', 2, false), ('out', '광고·마케팅', 3, false),
  ('out', '수수료·세금', 4, false), ('out', '가구·장비', 5, false), ('out', '공사비', 6, false), ('out', '기타', 7, false),
  ('in', '제품 판매', 1, false), ('in', '기타 수입', 2, false),
  ('in', '시술 매출(수기)', 9, true) -- 10/6부터 자동 계산. 지난 내역은 그대로 합계에 포함
) as v(io, name, sort, hidden)
where c.io = v.io and c.name = v.name;

commit;
