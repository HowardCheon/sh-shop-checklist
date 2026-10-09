import { describe, expect, it } from 'vitest'
import { kstDateOf, summarizeMonth, validateEntry, type AutoRow, type EntryRow, type PrepaidRow } from '../summary'

const cat = (id: number, name: string) => ({ id, name })
const entry = (p: Partial<EntryRow>): EntryRow => ({
  id: 1, entry_date: '2026-10-08', io: 'out', amount: 10000, category: cat(1, '재료비'), method: 'card',
  memo: null, excluded: false, exclude_reason: null, ...p,
})

describe('KST 날짜', () => {
  it('UTC 15:00 이후는 KST 다음 날', () => {
    expect(kstDateOf('2026-10-31T14:59:00Z')).toBe('2026-10-31')
    expect(kstDateOf('2026-10-31T15:00:00Z')).toBe('2026-11-01')
  })
})

describe('선불 충전 현황', () => {
  const prepaid: PrepaidRow[] = [
    { at: '2026-09-29T03:00:00Z', type: 'charge', cash: 500000, bonus: 0 },
    { at: '2026-09-29T04:00:00Z', type: 'use', cash: -130000, bonus: 0 },
    { at: '2026-10-06T13:00:00Z', type: 'charge', cash: 2000000, bonus: 250000 },
    { at: '2026-10-07T02:00:00Z', type: 'use', cash: -311112, bonus: -38888 },
    { at: '2026-10-07T03:00:00Z', type: 'use_cancel', cash: 11112, bonus: 1388 },
    { at: '2026-10-08T03:00:00Z', type: 'refund', cash: -100000, bonus: -10000 },
    { at: '2026-10-31T15:30:00Z', type: 'charge', cash: 1000000, bonus: 100000 }, // KST 11/1 → 다음 달
  ]
  it('월초·충전·사용(취소 반영)·환불·월말 — 실제/보너스 구분', () => {
    const s = summarizeMonth({ month: '2026-10', entries: [], auto: [], prepaid })
    expect(s.prepaid.open).toEqual({ cash: 370000, bonus: 0 })
    expect(s.prepaid.charge).toEqual({ cash: 2000000, bonus: 250000 })
    expect(s.prepaid.use).toEqual({ cash: 300000, bonus: 37500 })
    expect(s.prepaid.refund).toEqual({ cash: 100000, bonus: 10000 })
    expect(s.prepaid.close).toEqual({ cash: 1970000, bonus: 202500 })
  })
})

describe('선불 월초 잔액을 DB 합계로 받는 경우 (행 수 상한 대비)', () => {
  it('prepaidOpen + 그 달 기록만으로 계산', () => {
    const s = summarizeMonth({
      month: '2026-10', entries: [], auto: [], prepaidOpen: { cash: 370000, bonus: 0 },
      prepaid: [{ at: '2026-10-06T13:00:00Z', type: 'charge', cash: 2000000, bonus: 250000 }],
    })
    expect(s.prepaid.open).toEqual({ cash: 370000, bonus: 0 })
    expect(s.prepaid.close).toEqual({ cash: 2370000, bonus: 250000 })
  })
})

describe('손익', () => {
  const auto: AutoRow[] = [
    { at: '2026-10-06T13:00:00Z', kind: 'charge', amount: 2000000, method: null, label: '선불 충전 · 정순영' },
    { at: '2026-10-06T13:10:00Z', kind: 'trial', amount: 219000, method: 'card', label: '첫체험 4회 · 국유경' },
    { at: '2026-10-09T12:30:00Z', kind: 'payment', amount: 150000, method: 'cash', label: '시술 · 장시온' },
    { at: '2026-10-10T02:00:00Z', kind: 'refund', amount: -100000, method: null, label: '선불 환불 · 홍길동' },
  ]
  const entries: EntryRow[] = [
    entry({ id: 1, amount: 68000, category: cat(1, '재료비') }),
    entry({ id: 2, amount: 500000, category: cat(2, '임대료'), method: 'transfer' }),
    entry({ id: 3, amount: 30000, category: cat(1, '재료비'), method: 'cash' }),
    entry({ id: 4, io: 'in', amount: 200000, category: cat(9, '시술 매출(수기)'), method: 'cash', entry_date: '2026-10-01' }),
    entry({ id: 5, io: 'in', amount: 2000000, category: cat(9, '시술 매출(수기)'), excluded: true, exclude_reason: '중복', entry_date: '2026-10-01' }),
    entry({ id: 6, amount: 999, category: cat(1, '재료비'), entry_date: '2026-09-30' }), // 다른 달
  ]
  const s = summarizeMonth({ month: '2026-10', entries, auto, prepaid: [] })

  it('매출 = 자동(충전·첫체험·시술·환불) + 수기, 제외·다른 달 빠짐, 순이익', () => {
    expect(s.pnl.revenueAuto).toBe(2269000)
    expect(s.pnl.revenueManual).toBe(200000)
    expect(s.pnl.revenue).toBe(2469000)
    expect(s.pnl.expense).toBe(598000)
    expect(s.pnl.net).toBe(1871000)
    expect(s.pnl.byKind).toEqual([
      { label: '선불 충전', count: 2000000 }, { label: '첫체험', count: 219000 }, { label: '시술·결제', count: 150000 },
      { label: '환불', count: -100000 }, { label: '시술 매출(수기)', count: 200000 },
    ])
  })
  it('지출 항목별 (증빙 집계는 없음)', () => {
    expect(s.byCategory).toEqual([{ label: '임대료', count: 500000 }, { label: '재료비', count: 98000 }])
    expect(s).not.toHaveProperty('byEvidence')
  })
  it('결제수단별 매출 (충전은 수단 미기록, 수기 포함)', () => {
    expect(s.byMethod).toEqual([
      { label: '선불 충전', count: 2000000 }, { label: '현금', count: 350000 }, { label: '카드', count: 219000 }, { label: '환불', count: -100000 },
    ])
  })
  it('날짜별 내역: 최신 날짜 먼저, 제외 줄 포함·합계 제외', () => {
    expect(s.days.map(d => d.date)).toEqual(['2026-10-10', '2026-10-09', '2026-10-08', '2026-10-06', '2026-10-01'])
    const d1 = s.days.find(d => d.date === '2026-10-01')!
    expect(d1.items).toHaveLength(2)
    expect(d1.total).toBe(200000)
    expect(s.days.find(d => d.date === '2026-10-08')!.total).toBe(-598000)
  })
})

describe('입력 검증', () => {
  const cats = [{ id: 1, io: 'out' as const, name: '재료비' }, { id: 9, io: 'in' as const, name: '제품 판매' }]
  const ok = { entry_date: '2026-10-08', io: 'out', amount: 68000, category_id: 1, method: 'card', memo: ' 쿠팡 ' }
  it('정리된 값 (증빙·거래처는 받지 않음)', () => {
    expect(validateEntry({ ...ok, evidence: 'card', vendor: '쿠팡' }, cats)).toEqual({
      entry_date: '2026-10-08', io: 'out', amount: 68000, category_id: 1, method: 'card',
      memo: '쿠팡', excluded: false, exclude_reason: null,
    })
  })
  it('오류', () => {
    expect(() => validateEntry({ ...ok, amount: 0 }, cats)).toThrow(/금액/)
    expect(() => validateEntry({ ...ok, amount: '1000' }, cats)).toThrow(/금액/)
    expect(() => validateEntry({ ...ok, entry_date: '2026-13-01' }, cats)).toThrow(/날짜/)
    expect(() => validateEntry({ ...ok, category_id: 9 }, cats)).toThrow(/항목/) // 지출에 수입 항목
    expect(() => validateEntry({ ...ok, method: 'bitcoin' }, cats)).toThrow(/결제수단/)
  })
})
