# 샵 가계부 이전·개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 탭에 샵 가계부(선불 현황·손익·증빙별·내역·입력·항목 관리)를 만들고, EST 46건을 새 테이블로 옮기며, 옛 앱 에스테틱 모드를 숨긴다.

**Architecture:** 새 테이블 2개 + 조회 시 자동 매출 계산. 순수 집계 `lib/ledger/summary.ts`, 조회 `lib/ledger/repo.ts`, API 4개, `/admin` 탭 화면.

**Tech Stack:** Next.js 16.3, Supabase, vitest / cafe24: 정적 HTML

**Spec:** `docs/superpowers/specs/2026-10-09-shop-ledger-design.md`

## Global Constraints
- 자동 매출 기준일 2026-10-06(KST), 선불 차감분은 매출 아님, 보너스는 매출 아님
- 증빙 값: card / cash_receipt / tax_invoice / none / unknown
- 날짜는 KST

## Review Focus
- 월 경계(KST 자정) 자동 매출·선불 기록 귀속 — 23:59 KST 기록이 다음 달로 가지 않아야 함 (Task 1 단위)
- 제외 표시된 내역은 합계에서 빠지되 목록에는 보임 (Task 1 단위)
- 카테고리 io 와 다른 구분으로 입력 → 400 (Task 2 스모크)
- 숨긴 항목을 쓰던 기존 내역은 그대로 보이고 수정 가능 (Task 3 브라우저)
- 첫체험 결제가 시술 결제로 이중 집계되지 않음 (Task 1 단위)

---

### Task 1: 순수 집계 `lib/ledger/summary.ts` (+ `lib/ledger/__tests__/summary.test.ts`)
- Produces: `type AutoRow = { at: string; kind: 'charge'|'trial'|'payment'|'refund'; amount: number; method: 'card'|'cash'|'transfer'|null; label: string; link?: string }`, `type EntryRow = { id; entry_date; io; amount; category: { id; name }; method; evidence; vendor; memo; excluded; exclude_reason }`, `type PrepaidRow = { at: string; type: 'charge'|'use'|'use_cancel'|'refund'; cash: number; bonus: number }`, `summarizeMonth({ month, entries, auto, prepaid }) → { prepaid: { open, charge, use, refund, close } (각 {cash,bonus}), pnl: { revenue, revenueAuto, revenueManual, byKind, expense, net }, byCategory: Ranked[], byEvidence: Ranked[], byMethod: Ranked[], days: Day[] }`, `kstDateOf(iso)`, `validateEntry(input, categories)`
- 테스트 먼저: 월 경계, 선불 월초/월말, 자동 종류·결제수단, 제외, 증빙, 수기/자동, 검증 오류
- 커밋: `feat: 샵 가계부 월 집계·입력 검증 규칙`

### Task 2: DB·이전·API (+ `scripts/ledger-smoke.mjs` 먼저)
- SQL `docs/sql/2026-10-09-ledger.sql`: 테이블·인덱스·RLS·기본 항목·EST 이전(보정·중복 제외 포함, 멱등)
- `lib/ledger/repo.ts`: `loadMonth(month)` → { entries, auto, prepaid, customersWithBalance }
- 라우트: `app/api/ledger/route.ts`(GET month), `app/api/ledger/entries/route.ts`(POST), `app/api/ledger/entries/[id]/route.ts`(PUT, DELETE), `app/api/ledger/categories/route.ts`(GET, POST), `app/api/ledger/categories/[id]/route.ts`(PUT)
- 이전 검증 쿼리(건수·합계·제외·보정)
- 커밋: `feat: 샵 가계부 테이블·EST 이전·API`

### Task 3: 화면 (`app/admin/*`)
- `/admin?tab=` 메뉴, `LedgerView`(선불 표·손익·항목별·증빙별·결제수단별·내역), `EntrySheet`, `CategorySheet`
- 브라우저 확인 후 커밋: `feat: 관리자 탭 샵 가계부 화면`

### Task 4: 옛 앱 에스테틱 숨김 (`C:\ai\cafe24\vercel_cafe24`)
- index.html 토글·est 섹션 제거, api `biz=est` 410, 테스트(있으면) 통과
- 커밋(해당 저장소): `chore: 에스테틱 가계부는 샵 관리자 앱으로 이전 — 모드 숨김`
