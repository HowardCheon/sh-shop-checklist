-- 홈페이지(sh_shop_home) 기준 시술 명칭·시간 정리 + slug (2026-09-28)

alter table sh_shop_products add column if not exists slug text;
create unique index if not exists sh_shop_products_slug_uq on sh_shop_products(slug) where slug is not null;

update sh_shop_products p set name = v.name, duration_min = v.duration_min, service_group = v.grp, slug = v.slug, sort_order = v.sort_order
from (values
  ('베이직 관리',                         '베이직 피부관리',        60,  'FACE',    'basic-care',     21),
  ('시그니처 관리',                       '시그니처 피부관리',      70,  'FACE',    'signature-care', 22),
  ('3D 윤곽관리',                         '3D 윤곽관리',            80,  'FACE',    'contour',        23),
  ('수소테라피',                          '수소 LDM 테라피',        80,  'FACE',    'hydrogen-ldm',   24),
  ('플라즈마',                            '플라즈마 관리',          80,  'FACE',    'plasma-care',    25),
  ('MTS셀유스 줄기세포 + 플라즈마',        '셀유스 안티에이징 관리', 90,  'PREMIUM', 'cell-youth',     31),
  ('펩타이드 단백질관리 + 플라즈마',        '펩타이드 단백질 관리',   90,  'PREMIUM', 'peptide-care',   32),
  ('전신 로즈디톡스 해독관리',              '로즈 해독 케어',         60,  'BODY',    'rose-detox',     11),
  ('스톤 등테라피',                       '스톤 등 근막 순환케어',  50,  'BODY',    'back-care',      12),
  ('스톤 복부 테라피',                    '스톤 복부 순환 케어',    50,  'BODY',    'belly-care',     13),
  ('하체관리 (고주파+골반교정)',            '하체관리',               60,  'BODY',    'body-lower',     14),
  ('상체관리 (고주파 등+복부+가슴+데콜테)',  '상체관리',               60,  'BODY',    'body-upper',     15),
  ('전신관리 (고주파+수기)',               '전신관리',               120, 'BODY',    'body-full',      16),
  ('에너지 전신 (에너지관리+수기)',         '에너지 전신',            120, 'BODY',    'body-energy',    17)
) as v(old_name, name, duration_min, grp, slug, sort_order)
where p.category = 'service' and p.name = v.old_name;

update sh_shop_products set description = v.description
from (values
  ('하체관리', '고주파 + 골반 주변 이완'),
  ('상체관리', '고주파 등·복부·가슴·데콜테'),
  ('전신관리', '고주파 + 수기'),
  ('에너지 전신', '에너지관리 + 수기')
) as v(name, description)
where sh_shop_products.category = 'service' and sh_shop_products.name = v.name and sh_shop_products.description is null;

insert into sh_shop_products (category, service_group, name, price, member_price, duration_min, is_active, sort_order, slug)
select 'service', 'BODY', '산후관리', 190000, 150000, 120, true, 18, 'postpartum'
where not exists (select 1 from sh_shop_products where category = 'service' and name = '산후관리');
