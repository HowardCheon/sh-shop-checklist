# CAD 평면도 도구 Supabase 통합 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `C:\ai\cad`의 3개 독립형 CAD 평면도 HTML 도구(pg_cad/mobile_cad/hanam508b_cad)를 `sh_shop_check` Next.js 프로젝트에 편입시켜 온라인으로 열람하고, 저장 버튼으로 Supabase에 저장/자동 로드되도록 한다. JSON 내보내기/가져오기는 변경하지 않는다.

**Architecture:** 원본 HTML을 거의 그대로 `public/floorplan/*.html` 정적 파일로 옮기고(격리를 위해 iframe으로 임베드), 저장/불러오기 로직만 `fetch`로 새 `/api/floorplan` 라우트를 호출하도록 3곳만 수정한다. `/api/floorplan`은 신설 Supabase 테이블 `sh_shop_floorplans`에 `{slug, data}`를 upsert/select한다. `/floorplan/shop`은 화면 폭에 따라 데스크톱/모바일 정적 파일 중 하나를 iframe에 로드하며 둘 다 slug `shop`을 공유한다. `/floorplan/hanam508b`는 별도 slug. 두 라우트 모두 하단 탭 메뉴에는 노출하지 않는다.

**Tech Stack:** Next.js 16.2.9 (App Router, Turbopack), React 19.2, TypeScript, Supabase (`@supabase/supabase-js`), 순수 vanilla JS(원본 CAD 도구 내부 로직, 변경 없음).

## Global Constraints

- Supabase 테이블/컬럼 네이밍은 기존 컨벤션(`sh_shop_products`, `sh_shop_checklist` 등)을 따라 `sh_shop_` 접두사를 사용한다.
- 이 저장소에는 자동화 테스트 프레임워크가 없다(package.json에 test 스크립트 없음). 모든 검증은 `npm run dev` + 브라우저 수동 확인으로 한다.
- Route Handler는 `NextRequest`/`NextResponse`와 `req.nextUrl.searchParams`를 사용한다(Next.js 16 표준 패턴, `app/api/checklist/route.ts` 참고). GET 핸들러의 기본 캐싱은 Next.js 15+부터 dynamic이므로 별도 `export const dynamic` 설정은 불필요하다.
- `app/api/*/route.ts`는 `@/lib/supabase`의 `supabase` 클라이언트를 재사용한다(서비스 롤 키가 있으면 그것을 사용).
- 포팅되는 3개 정적 HTML 파일의 원본 CSS/캔버스 드로잉 로직은 절대 수정하지 않는다 — 오직 저장/불러오기/초기화 3곳만 수정한다.
- JSON 내보내기(`#exportJson`)/가져오기(`#importJson`, `#fileInput`)는 어떤 파일에서도 수정하지 않는다.
- 새 라우트(`/floorplan/shop`, `/floorplan/hanam508b`)는 `components/BottomNav.tsx`의 `TABS` 배열에 추가하지 않는다(하단 탭 미노출 요구사항).
- 커밋 메시지는 저장소 기존 스타일(`feat:`, `fix:` 등 conventional 접두사 + 한글 설명)을 따른다.

---

## Task 1: Supabase 테이블 생성

**Files:**
- 없음 (Supabase 프로젝트에 직접 SQL 실행, 저장소에 마이그레이션 파일 없음 — 기존 테이블들도 동일한 방식으로 생성됨)

**Interfaces:**
- Produces: 테이블 `sh_shop_floorplans(slug text primary key, data jsonb not null, updated_at timestamptz not null default now())` — Task 2의 API 라우트가 이 테이블에 대해 select/upsert를 수행함.

- [ ] **Step 1: `.env.local`의 Supabase Management API 자격 증명으로 테이블 생성 SQL 실행**

Run (Git Bash):
```bash
cd /c/ai/sh_shop_check
set -a
source .env.local
set +a
curl -s -X POST "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"query":"create table if not exists sh_shop_floorplans (slug text primary key, data jsonb not null, updated_at timestamptz not null default now());"}'
```

Expected: JSON 응답에 `"error"` 필드가 없어야 한다(빈 배열 `[]` 또는 성공 메타데이터 반환).

- [ ] **Step 2: 테이블이 실제로 생성됐는지 조회로 확인**

Run:
```bash
cd /c/ai/sh_shop_check
set -a
source .env.local
set +a
curl -s -X POST "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"query":"select slug, data, updated_at from sh_shop_floorplans limit 1;"}'
```

Expected: `[]` (빈 배열, 에러 없음) — 테이블은 존재하지만 아직 행이 없다는 뜻.

이 태스크는 코드 변경이 없으므로 git 커밋 없음.

---

## Task 2: API 라우트 `app/api/floorplan/route.ts`

**Files:**
- Create: `app/api/floorplan/route.ts`

**Interfaces:**
- Consumes: `@/lib/supabase`의 `supabase` 클라이언트(기존 파일, 변경 없음), Task 1의 테이블 `sh_shop_floorplans`.
- Produces:
  - `GET /api/floorplan?slug=<string>` → `{ data: object | null }` (200) 또는 `{ error: string }` (400/500)
  - `POST /api/floorplan` (body: `{ slug: string, data: object }`) → `{ ok: true }` (200) 또는 `{ error: string }` (400/500)
  - 이 두 엔드포인트는 Task 5/6/7에서 포팅되는 정적 HTML의 `fetch()` 호출 대상이 됨.

- [ ] **Step 1: 라우트 파일 작성**

Create `app/api/floorplan/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/floorplan?slug=shop|hanam508b → { data: object | null }
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug')
  if (!slug) return NextResponse.json({ error: 'slug가 필요합니다' }, { status: 400 })

  const { data, error } = await supabase
    .from('sh_shop_floorplans')
    .select('data')
    .eq('slug', slug)
    .maybeSingle()

  if (error) return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  return NextResponse.json({ data: data?.data ?? null })
}

// POST /api/floorplan → { slug: string, data: object }
export async function POST(req: NextRequest) {
  const { slug, data } = await req.json() as { slug: string; data: object }
  if (!slug || !data) return NextResponse.json({ error: 'slug, data가 필요합니다' }, { status: 400 })

  const { error } = await supabase
    .from('sh_shop_floorplans')
    .upsert(
      { slug, data, updated_at: new Date().toISOString() },
      { onConflict: 'slug' }
    )

  if (error) return NextResponse.json({ error: '저장 실패' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: dev 서버 구동 (아직 실행 중이 아니면)**

Run: `npm run dev` (백그라운드로 실행 유지, 이후 태스크에서도 계속 사용)
Expected: `http://localhost:3000`에서 서버가 뜬다는 로그.

- [ ] **Step 3: POST로 저장 확인**

Run:
```bash
curl -s -X POST http://localhost:3000/api/floorplan \
  -H "Content-Type: application/json" \
  -d '{"slug":"test","data":{"shapes":[],"canvasCmW":100,"canvasCmH":100}}'
```
Expected: `{"ok":true}`

- [ ] **Step 4: GET으로 조회 확인**

Run: `curl -s "http://localhost:3000/api/floorplan?slug=test"`
Expected: `{"data":{"shapes":[],"canvasCmW":100,"canvasCmH":100}}`

- [ ] **Step 5: 존재하지 않는 slug는 null 반환하는지 확인**

Run: `curl -s "http://localhost:3000/api/floorplan?slug=does-not-exist"`
Expected: `{"data":null}`

- [ ] **Step 6: 테스트로 만든 행 정리**

Run:
```bash
cd /c/ai/sh_shop_check
set -a
source .env.local
set +a
curl -s -X POST "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"delete from sh_shop_floorplans where slug = 'test';\"}"
```
Expected: 에러 없는 응답.

- [ ] **Step 7: 커밋**

```bash
git add app/api/floorplan/route.ts
git commit -m "$(cat <<'EOF'
feat: 평면도 저장/조회 API 라우트 추가

CAD 평면도 도구(가게/하남508B)가 Supabase sh_shop_floorplans 테이블에
slug 기준으로 저장/조회할 수 있도록 GET/POST /api/floorplan 추가.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `BottomNav`에서 `/floorplan` 경로 숨김 처리

**Files:**
- Modify: `components/BottomNav.tsx:76-78` (컴포넌트 본문 시작 부분)

**Interfaces:**
- Consumes: `usePathname()` (기존 import, 변경 없음)
- Produces: `/floorplan`으로 시작하는 모든 경로에서 `BottomNav`가 `null`을 렌더링함 — Task 4/7에서 만드는 CAD 도구 페이지가 전체 화면을 쓸 수 있게 됨.

- [ ] **Step 1: 경로 가드 추가**

`components/BottomNav.tsx`에서 다음을 찾는다:
```tsx
export default function BottomNav() {
  const pathname = usePathname()

  return (
```

다음으로 교체:
```tsx
export default function BottomNav() {
  const pathname = usePathname()
  if (pathname.startsWith('/floorplan')) return null

  return (
```

- [ ] **Step 2: 회귀 확인 — 기존 페이지에서는 여전히 보이는지 확인**

Run: `npm run dev` (이미 떠 있으면 생략), 브라우저에서 `http://localhost:3000/` 접속.
Expected: 하단 탭(체크리스트/시술메뉴/예약/고객)이 평소처럼 보인다.

- [ ] **Step 3: 커밋**

```bash
git add components/BottomNav.tsx
git commit -m "$(cat <<'EOF'
feat: /floorplan 경로에서 하단 탭 숨김

CAD 평면도 도구가 원본처럼 전체 화면을 쓸 수 있도록, 하단 탭 메뉴에는
추가하지 않으면서 BottomNav 자체를 이 경로에서만 숨김.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 빌리브하남 508B 도면 포팅

**Files:**
- Create: `public/floorplan/hanam508b.html` (원본 `C:\ai\cad\hanam508b_cad.html` 복사 후 수정)
- Create: `app/floorplan/hanam508b/page.tsx`

**Interfaces:**
- Consumes: Task 2의 `GET/POST /api/floorplan?slug=hanam508b`
- Produces: 브라우저에서 `/floorplan/hanam508b` 접속 시 뜨는 페이지.

- [ ] **Step 1: 원본 파일을 그대로 복사**

Run:
```bash
mkdir -p /c/ai/sh_shop_check/public/floorplan
cp "/c/ai/cad/hanam508b_cad.html" "/c/ai/sh_shop_check/public/floorplan/hanam508b.html"
```

- [ ] **Step 2: "불러오기" 버튼 마크업 제거**

`public/floorplan/hanam508b.html`에서 다음을 찾는다:
```html
    <button id="saveLocal">💾 저장</button>
    <button id="loadLocal">📂 불러오기</button>
    <button id="exportJson">⬇ JSON 내보내기</button>
```

다음으로 교체:
```html
    <button id="saveLocal">💾 저장</button>
    <button id="exportJson">⬇ JSON 내보내기</button>
```

- [ ] **Step 3: 저장/불러오기 핸들러를 Supabase 호출로 교체**

다음을 찾는다:
```javascript
  // ---------- Save / Load / Export ----------
  const STORAGE_KEY = "hanam508b-floorplan-v1";
  document.getElementById("saveLocal").addEventListener("click", ()=>{
    localStorage.setItem(STORAGE_KEY, snapshot());
    showToast("브라우저에 저장되었습니다.");
  });
  document.getElementById("loadLocal").addEventListener("click", ()=>{
    const data = localStorage.getItem(STORAGE_KEY);
    if(!data){ showToast("저장된 데이터가 없습니다."); return; }
    restoreSnapshot(data);
    pushHistory();
    showToast("불러왔습니다.");
  });
```

다음으로 교체:
```javascript
  // ---------- Save / Load / Export ----------
  const FLOORPLAN_SLUG = "hanam508b";
  document.getElementById("saveLocal").addEventListener("click", ()=>{
    fetch("/api/floorplan", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ slug: FLOORPLAN_SLUG, data: JSON.parse(snapshot()) }),
    })
      .then(res=>{ if(!res.ok) throw new Error("save failed"); showToast("저장되었습니다."); })
      .catch(()=> showToast("저장에 실패했습니다. 다시 시도해주세요."));
  });
```

- [ ] **Step 4: 초기 로드를 Supabase에서 가져오도록 교체**

다음을 찾는다:
```javascript
  // ---------- Init ----------
  function init(){
    resizeCanvas();
    // load previous session if present, else seed with the traced floor plan
    const saved = localStorage.getItem(STORAGE_KEY);
    if(saved){
      try{ restoreSnapshot(saved); }catch(e){ seedDefault(); }
    } else {
      seedDefault();
      render();
    }
    pushHistory();
    render();
  }
  init();
```

다음으로 교체:
```javascript
  // ---------- Init ----------
  async function init(){
    resizeCanvas();
    // load from Supabase if present, else seed with the traced floor plan
    try{
      const res = await fetch(`/api/floorplan?slug=${FLOORPLAN_SLUG}`);
      const json = await res.json();
      if(json.data){
        restoreSnapshot(JSON.stringify(json.data));
      } else {
        seedDefault();
        render();
      }
    } catch(e){
      showToast("불러오기에 실패했습니다. 기본 도면에서 시작합니다.");
      seedDefault();
      render();
    }
    pushHistory();
    render();
  }
  init();
```

- [ ] **Step 5: 페이지 컴포넌트 작성**

Create `app/floorplan/hanam508b/page.tsx`:
```tsx
'use client'

export default function Hanam508bFloorplanPage() {
  return (
    <iframe
      src="/floorplan/hanam508b.html"
      title="빌리브하남 508B 평면도"
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', border: 0 }}
    />
  )
}
```

- [ ] **Step 6: 브라우저 수동 검증**

`http://localhost:3000/floorplan/hanam508b` 접속.
Expected:
- 1층/다락 탭이 있는 기존 도구 UI가 뜨고, 최초 접속 시 시드 데이터(주방/거실/방 등)가 보인다.
- "불러오기" 버튼은 더 이상 보이지 않는다.
- 아무 도형이나 하나 그린 뒤 "💾 저장" 클릭 → "저장되었습니다." 토스트가 뜬다.
- 페이지를 새로고침(F5) → 방금 그린 도형이 그대로 남아있다(Supabase에서 로드됨).
- ⬇ JSON 내보내기 클릭 → `hanam508b-floorplan-1층.json` 등 파일이 정상 다운로드된다(기존과 동일한 동작).

- [ ] **Step 7: 커밋**

```bash
git add public/floorplan/hanam508b.html app/floorplan/hanam508b/page.tsx
git commit -m "$(cat <<'EOF'
feat: 빌리브하남 508B 평면도 도구 온라인 편입

C:\ai\cad\hanam508b_cad.html을 /floorplan/hanam508b 경로로 포팅.
저장 버튼은 Supabase(slug=hanam508b)에 저장하고, 접속 시 자동 로드.
JSON 내보내기/가져오기는 기존과 동일하게 유지.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 가게 평면도 (PC용) 포팅

**Files:**
- Create: `public/floorplan/shop-desktop.html` (원본 `C:\ai\cad\pg_cad.html` 복사 후 수정)

**Interfaces:**
- Consumes: Task 2의 `GET/POST /api/floorplan?slug=shop`
- Produces: 정적 파일 `/floorplan/shop-desktop.html` — Task 7의 `app/floorplan/shop/page.tsx`가 데스크톱 폭일 때 이 파일을 iframe에 로드함.

- [ ] **Step 1: 원본 파일을 그대로 복사**

Run:
```bash
cp "/c/ai/cad/pg_cad.html" "/c/ai/sh_shop_check/public/floorplan/shop-desktop.html"
```

- [ ] **Step 2: "불러오기" 버튼 마크업 제거**

다음을 찾는다:
```html
    <button id="saveLocal">💾 저장</button>
    <button id="loadLocal">📂 불러오기</button>
    <button id="exportJson">⬇ JSON 내보내기</button>
```

다음으로 교체:
```html
    <button id="saveLocal">💾 저장</button>
    <button id="exportJson">⬇ JSON 내보내기</button>
```

- [ ] **Step 3: 저장/불러오기 핸들러를 Supabase 호출로 교체**

다음을 찾는다:
```javascript
  // ---------- Save / Load / Export ----------
  const STORAGE_KEY = "shop-floorplan-v1";
  document.getElementById("saveLocal").addEventListener("click", ()=>{
    localStorage.setItem(STORAGE_KEY, snapshot());
    showToast("브라우저에 저장되었습니다.");
  });
  document.getElementById("loadLocal").addEventListener("click", ()=>{
    const data = localStorage.getItem(STORAGE_KEY);
    if(!data){ showToast("저장된 데이터가 없습니다."); return; }
    restoreSnapshot(data);
    pushHistory();
    showToast("불러왔습니다.");
  });
```

다음으로 교체:
```javascript
  // ---------- Save / Load / Export ----------
  const FLOORPLAN_SLUG = "shop";
  document.getElementById("saveLocal").addEventListener("click", ()=>{
    fetch("/api/floorplan", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ slug: FLOORPLAN_SLUG, data: JSON.parse(snapshot()) }),
    })
      .then(res=>{ if(!res.ok) throw new Error("save failed"); showToast("저장되었습니다."); })
      .catch(()=> showToast("저장에 실패했습니다. 다시 시도해주세요."));
  });
```

- [ ] **Step 4: 초기 로드를 Supabase에서 가져오도록 교체**

다음을 찾는다:
```javascript
  // ---------- Init ----------
  function init(){
    resizeCanvas();
    // load previous session if present, else seed with an example room
    const saved = localStorage.getItem(STORAGE_KEY);
    if(saved){
      try{ restoreSnapshot(saved); }catch(e){}
    } else {
      state.shapes.push(makeShape("room", 50, 50, 1140, 380, {label:"매장 홀", locked:true}));
      state.shapes.push(makeShape("counter", 400, 60, 120, 60, {label:"카운터"}));
      render();
    }
    pushHistory();
    render();
  }
  init();
```

다음으로 교체:
```javascript
  // ---------- Init ----------
  async function init(){
    resizeCanvas();
    // load from Supabase if present, else seed with an example room
    try{
      const res = await fetch(`/api/floorplan?slug=${FLOORPLAN_SLUG}`);
      const json = await res.json();
      if(json.data){
        restoreSnapshot(JSON.stringify(json.data));
      } else {
        state.shapes.push(makeShape("room", 50, 50, 1140, 380, {label:"매장 홀", locked:true}));
        state.shapes.push(makeShape("counter", 400, 60, 120, 60, {label:"카운터"}));
        render();
      }
    } catch(e){
      showToast("불러오기에 실패했습니다. 빈 화면에서 시작합니다.");
      state.shapes.push(makeShape("room", 50, 50, 1140, 380, {label:"매장 홀", locked:true}));
      state.shapes.push(makeShape("counter", 400, 60, 120, 60, {label:"카운터"}));
      render();
    }
    pushHistory();
    render();
  }
  init();
```

- [ ] **Step 5: 브라우저 수동 검증 (정적 파일 직접 접속)**

`http://localhost:3000/floorplan/shop-desktop.html` 접속.
Expected:
- 사이드바 툴/속성 패널이 있는 PC용 UI가 뜬다. 최초 접속 시 "매장 홀"+"카운터" 시드 데이터가 보인다.
- "불러오기" 버튼이 보이지 않는다.
- 카운터 옆에 가구 하나 추가 → 💾 저장 클릭 → "저장되었습니다." 토스트.
- 새로고침 → 추가한 가구가 그대로 남아있다.

- [ ] **Step 6: 커밋**

```bash
git add public/floorplan/shop-desktop.html
git commit -m "$(cat <<'EOF'
feat: 가게 평면도(PC용) 도구 온라인 편입

C:\ai\cad\pg_cad.html을 public/floorplan/shop-desktop.html로 포팅.
저장 버튼은 Supabase(slug=shop)에 저장하고, 접속 시 자동 로드.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 가게 평면도 (모바일용) 포팅

**Files:**
- Create: `public/floorplan/shop-mobile.html` (원본 `C:\ai\cad\mobile_cad.html` 복사 후 수정)

**Interfaces:**
- Consumes: Task 2의 `GET/POST /api/floorplan?slug=shop` (Task 5와 동일 slug — 데이터 공유)
- Produces: 정적 파일 `/floorplan/shop-mobile.html` — Task 7의 `app/floorplan/shop/page.tsx`가 모바일 폭일 때 이 파일을 iframe에 로드함.

- [ ] **Step 1: 원본 파일을 그대로 복사**

Run:
```bash
cp "/c/ai/cad/mobile_cad.html" "/c/ai/sh_shop_check/public/floorplan/shop-mobile.html"
```

- [ ] **Step 2: "불러오기" 버튼 마크업 제거**

다음을 찾는다:
```html
    <button id="saveLocal">💾 저장</button>
    <button id="loadLocal">📂 불러오기</button>
    <button id="exportJson">⬇ JSON 내보내기</button>
```

다음으로 교체:
```html
    <button id="saveLocal">💾 저장</button>
    <button id="exportJson">⬇ JSON 내보내기</button>
```

- [ ] **Step 3: 저장/불러오기 핸들러를 Supabase 호출로 교체**

다음을 찾는다 (모바일 버전은 STORAGE_KEY 위에 주석 2줄이 더 있고, `loadLocal` 핸들러 끝에 `closeDrawer()` 호출이 있다는 점이 데스크톱 버전과 다르다):
```javascript
  // ---------- Save / Load / Export ----------
  // Same localStorage key as index.html: opening both from the same origin shares saves,
  // and JSON export/import files are interchangeable either direction.
  const STORAGE_KEY = "shop-floorplan-v1";
  document.getElementById("saveLocal").addEventListener("click", ()=>{
    localStorage.setItem(STORAGE_KEY, snapshot());
    showToast("브라우저에 저장되었습니다.");
  });
  document.getElementById("loadLocal").addEventListener("click", ()=>{
    const data = localStorage.getItem(STORAGE_KEY);
    if(!data){ showToast("저장된 데이터가 없습니다."); return; }
    restoreSnapshot(data);
    pushHistory();
    showToast("불러왔습니다.");
    closeDrawer();
  });
```

다음으로 교체:
```javascript
  // ---------- Save / Load / Export ----------
  // Same Supabase slug as shop-desktop.html: both share the same saved floor plan.
  const FLOORPLAN_SLUG = "shop";
  document.getElementById("saveLocal").addEventListener("click", ()=>{
    fetch("/api/floorplan", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ slug: FLOORPLAN_SLUG, data: JSON.parse(snapshot()) }),
    })
      .then(res=>{ if(!res.ok) throw new Error("save failed"); showToast("저장되었습니다."); })
      .catch(()=> showToast("저장에 실패했습니다. 다시 시도해주세요."));
  });
```

(주의: `saveLocal` 핸들러에는 원래도 `closeDrawer()` 호출이 없었다 — 저장 후에도 설정 서랍이 열린 채로 유지되는 기존 동작을 그대로 유지한다. `closeDrawer()` 호출은 `loadLocal` 핸들러와 함께 제거된다.)

- [ ] **Step 4: 초기 로드를 Supabase에서 가져오도록 교체**

다음을 찾는다:
```javascript
  // ---------- Init ----------
  function init(){
    resizeCanvas();
    // load previous session if present, else seed with an example room
    const saved = localStorage.getItem(STORAGE_KEY);
    if(saved){
      try{ restoreSnapshot(saved); }catch(e){}
    } else {
      state.shapes.push(makeShape("room", 50, 50, 1140, 380, {label:"매장 홀", locked:true}));
      state.shapes.push(makeShape("counter", 400, 60, 120, 60, {label:"카운터"}));
      render();
    }
    pushHistory();
    render();
  }
  init();
```

다음으로 교체:
```javascript
  // ---------- Init ----------
  async function init(){
    resizeCanvas();
    // load from Supabase if present, else seed with an example room
    try{
      const res = await fetch(`/api/floorplan?slug=${FLOORPLAN_SLUG}`);
      const json = await res.json();
      if(json.data){
        restoreSnapshot(JSON.stringify(json.data));
      } else {
        state.shapes.push(makeShape("room", 50, 50, 1140, 380, {label:"매장 홀", locked:true}));
        state.shapes.push(makeShape("counter", 400, 60, 120, 60, {label:"카운터"}));
        render();
      }
    } catch(e){
      showToast("불러오기에 실패했습니다. 빈 화면에서 시작합니다.");
      state.shapes.push(makeShape("room", 50, 50, 1140, 380, {label:"매장 홀", locked:true}));
      state.shapes.push(makeShape("counter", 400, 60, 120, 60, {label:"카운터"}));
      render();
    }
    pushHistory();
    render();
  }
  init();
```

- [ ] **Step 5: 브라우저 수동 검증**

브라우저 창을 모바일 폭(예: 개발자 도구 기기 툴바, 390px)으로 좁히거나 모바일 기기에서 `http://localhost:3000/floorplan/shop-mobile.html` 접속.
Expected:
- 하단 툴바 + 상단 ☰ 메뉴 버튼이 있는 모바일 UI가 뜬다.
- ☰ 클릭 → 설정 서랍에 "불러오기" 버튼이 없고 "💾 저장"만 있다.
- Task 5에서 데스크톱 버전으로 저장했던 가구가 이미 화면에 보인다(같은 slug `shop` 공유 확인).
- 도형 하나 이동 후 저장 → 토스트 확인 → 새로고침 → 유지 확인.

- [ ] **Step 6: 커밋**

```bash
git add public/floorplan/shop-mobile.html
git commit -m "$(cat <<'EOF'
feat: 가게 평면도(모바일용) 도구 온라인 편입

C:\ai\cad\mobile_cad.html을 public/floorplan/shop-mobile.html로 포팅.
PC용(shop-desktop.html)과 동일한 Supabase slug(shop)를 공유해 같은
가게 평면도를 PC/모바일 어디서든 읽고 쓴다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `/floorplan/shop` 반응형 페이지

**Files:**
- Create: `app/floorplan/shop/page.tsx`

**Interfaces:**
- Consumes: Task 5의 `public/floorplan/shop-desktop.html`, Task 6의 `public/floorplan/shop-mobile.html`
- Produces: 브라우저에서 `/floorplan/shop` 접속 시 뜨는 페이지 (화면 폭에 따라 자동으로 데스크톱/모바일 버전 선택).

- [ ] **Step 1: 페이지 컴포넌트 작성**

Create `app/floorplan/shop/page.tsx`:
```tsx
'use client'

import { useEffect, useState } from 'react'

export default function ShopFloorplanPage() {
  const [variant, setVariant] = useState<'desktop' | 'mobile' | null>(null)

  useEffect(() => {
    setVariant(window.innerWidth < 768 ? 'mobile' : 'desktop')
  }, [])

  if (!variant) return null

  return (
    <iframe
      src={variant === 'mobile' ? '/floorplan/shop-mobile.html' : '/floorplan/shop-desktop.html'}
      title="가게 평면도"
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', border: 0 }}
    />
  )
}
```

- [ ] **Step 2: 브라우저 창을 데스크톱 폭으로 하고 검증**

브라우저 창 폭을 768px 이상으로 하고 `http://localhost:3000/floorplan/shop` 접속.
Expected: PC용 UI(사이드바 있는 레이아웃)가 뜬다. Task 5/6에서 저장했던 도형들이 보인다.

- [ ] **Step 3: 브라우저 창을 모바일 폭으로 하고 검증**

개발자 도구로 폭을 768px 미만(예: 390px)으로 바꾼 뒤 `http://localhost:3000/floorplan/shop`을 새로고침.
Expected: 모바일용 UI(하단 툴바 레이아웃)가 뜨고, 같은 도형들이 보인다(같은 slug `shop` 공유 재확인).

- [ ] **Step 4: 리사이즈 시 유지되는지 확인 (데이터 유실 방지 동작 확인)**

데스크톱 폭에서 페이지를 로드한 채로, 새로고침 없이 브라우저 창만 모바일 폭으로 리사이즈.
Expected: iframe이 데스크톱 버전을 계속 보여준다(모바일로 자동 전환되지 않음 — 마운트 시 1회만 판정하므로 진행 중이던 작업이 리사이즈로 사라지지 않음).

- [ ] **Step 5: 커밋**

```bash
git add app/floorplan/shop/page.tsx
git commit -m "$(cat <<'EOF'
feat: /floorplan/shop 반응형 진입 페이지 추가

마운트 시 화면 폭(768px 기준)을 1회 판정해 PC용/모바일용 평면도 도구를
자동으로 선택. 하단 탭 메뉴에는 노출하지 않고 URL 직접 접근만 지원.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: 엔드투엔드 수동 검증 및 회귀 확인

**Files:**
- 없음 (코드 변경 없음, 검증 전용 태스크)

**Interfaces:**
- Consumes: Task 1~7의 모든 산출물

- [ ] **Step 1: 데이터 격리 확인 — `shop`과 `hanam508b`가 섞이지 않는지**

`/floorplan/shop`과 `/floorplan/hanam508b`를 각각 열어 서로 다른 도형을 그리고 저장한 뒤, 서로의 페이지를 새로고침해도 상대방의 도형이 나타나지 않는지 확인.
Expected: 두 슬롯의 데이터가 완전히 분리되어 있다.

- [ ] **Step 2: 저장 실패 시 토스트 확인 (에러 처리 확인)**

dev 서버를 잠깐 종료한 상태에서(또는 브라우저 개발자 도구 Network 탭에서 `/api/floorplan` 요청을 offline/block 처리) `/floorplan/shop`에서 💾 저장 클릭.
Expected: "저장에 실패했습니다. 다시 시도해주세요." 토스트가 뜨고, 화면의 도형은 사라지지 않는다(메모리 상태 유지). 이후 dev 서버를 다시 켜고 저장 재시도 시 정상 저장된다.

- [ ] **Step 3: JSON 내보내기/가져오기 회귀 확인 (3개 파일 전부)**

`/floorplan/shop`, `/floorplan/hanam508b` 각각에서 ⬇ JSON 내보내기로 파일을 받고, 전체 삭제 후 ⬆ JSON 가져오기로 방금 받은 파일을 다시 불러와 원래 상태로 복원되는지 확인.
Expected: 기존과 동일하게 동작(이번 작업에서 로직을 건드리지 않았으므로 회귀 없어야 함). 가져오기는 메모리 상태만 바꾸므로, Supabase에 반영하려면 별도로 💾 저장을 눌러야 한다는 점도 함께 확인.

- [ ] **Step 4: 기존 앱 페이지 회귀 확인**

`/`(체크리스트), `/products`, `/reservations`, `/customers`를 각각 열어 하단 탭이 정상 표시되고 정상 동작하는지 확인.
Expected: 이번 작업으로 인한 회귀 없음 — 특히 `BottomNav.tsx` 수정(Task 3)이 다른 경로에 영향을 주지 않았는지 확인.

- [ ] **Step 5: 최종 `git status`로 의도치 않은 변경 없는지 확인**

Run: `git status`
Expected: Task 1~7에서 커밋한 파일들 외에 unstaged/untracked 변경이 없다(`.playwright-mcp/` 등 이번 작업과 무관한 기존 항목은 무시).
