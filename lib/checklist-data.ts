export interface ChecklistItem {
  id: string
  text: string
  detail?: string
}

export interface ChecklistSection {
  id: string
  title: string
  emoji: string
  accent: string
  bgLight: string
  borderColor: string
  textColor: string
  checkColor: string
  progressColor: string
  items: ChecklistItem[]
}

export const sections: ChecklistSection[] = [
  {
    id: 'legal',
    title: '자격증 & 법적 요건',
    emoji: '📋',
    accent: 'rose',
    bgLight: '#fff1f2',
    borderColor: '#fecdd3',
    textColor: '#be123c',
    checkColor: '#f43f5e',
    progressColor: '#fb7185',
    items: [
      {
        id: 'l1',
        text: '피부미용사 자격증 취득',
        detail: '한국산업인력공단 · 영업 신고의 필수 선행 조건',
      },
      {
        id: 'l2',
        text: '공중위생영업(미용업 피부) 신고',
        detail: '관할 시/군/구청 위생과',
      },
      {
        id: 'l3',
        text: '사업자등록 신청',
        detail: '국세청 홈택스 (개인사업자)',
      },
      {
        id: 'l4',
        text: '건강진단서 발급',
        detail: '보건소 · 영업 신고 시 제출',
      },
    ],
  },
  {
    id: 'space',
    title: '공간 준비',
    emoji: '🏠',
    accent: 'amber',
    bgLight: '#fffbeb',
    borderColor: '#fde68a',
    textColor: '#b45309',
    checkColor: '#f59e0b',
    progressColor: '#fbbf24',
    items: [
      {
        id: 's1',
        text: '상가 임대계약 체결',
        detail: '권리금·보증금·월세 조건 협상 및 임대차계약서 확인',
      },
      {
        id: 's2',
        text: '최소 면적 요건 확인',
        detail: '피부미용업 6㎡ 이상 (법적 기준)',
      },
      {
        id: 's3',
        text: '인테리어 공사',
        detail: '관리실 커튼·파티션, 세면대, 소독기 설치',
      },
      {
        id: 's4',
        text: '소방 시설 확인',
        detail: '소화기·화재감지기 설치 여부 확인',
      },
    ],
  },
  {
    id: 'equipment',
    title: '장비 & 소모품',
    emoji: '✨',
    accent: 'emerald',
    bgLight: '#ecfdf5',
    borderColor: '#a7f3d0',
    textColor: '#065f46',
    checkColor: '#10b981',
    progressColor: '#34d399',
    items: [
      {
        id: 'e1',
        text: '피부관리 베드 구매',
        detail: '전동식 권장 · 고객 편의를 위한 핵심 장비',
      },
      {
        id: 'e2',
        text: '스팀기 & 우드램프 구매',
        detail: '피부 분석 및 기본 케어 필수 장비',
      },
      {
        id: 'e3',
        text: '미용기기 구매',
        detail: '고주파·갈바닉·LED·초음파 등',
      },
      {
        id: 'e4',
        text: '소독기 & 타월워머 구매',
        detail: '위생 관리 필수 장비',
      },
      {
        id: 'e5',
        text: '소모품 초도 물량 확보',
        detail: '앰플·마스크팩·일회용 스파툴라·코튼 등',
      },
      {
        id: 'e6',
        text: '위생 타월 & 가운 준비',
        detail: '고객 수 대비 여유 있게 준비',
      },
    ],
  },
  {
    id: 'booking',
    title: '예약 & 운영 시스템',
    emoji: '📅',
    accent: 'sky',
    bgLight: '#f0f9ff',
    borderColor: '#bae6fd',
    textColor: '#0369a1',
    checkColor: '#0ea5e9',
    progressColor: '#38bdf8',
    items: [
      {
        id: 'b1',
        text: '카카오 채널 개설',
        detail: '고객 상담·예약 기본 채널',
      },
      {
        id: 'b2',
        text: '예약 관리 앱 설정',
        detail: '네이버 예약·카카오 예약·셀렉트샵 등',
      },
      {
        id: 'b3',
        text: '카드 결제 단말기 준비',
        detail: '토스·아임포트·일반 단말기',
      },
      {
        id: 'b4',
        text: '고객 피부 카드 양식 준비',
        detail: '피부 타입, 트러블 이력, 알레르기 기록',
      },
    ],
  },
  {
    id: 'finance',
    title: '재정 계획',
    emoji: '💰',
    accent: 'violet',
    bgLight: '#f5f3ff',
    borderColor: '#ddd6fe',
    textColor: '#5b21b6',
    checkColor: '#7c3aed',
    progressColor: '#8b5cf6',
    items: [
      {
        id: 'f1',
        text: '초기 투자 비용 계획 수립',
        detail: '보증금·인테리어·장비·소모품 합산',
      },
      {
        id: 'f2',
        text: '소상공인 창업 대출 검토',
        detail: '소진공, 지역 신용보증재단',
      },
      {
        id: 'f3',
        text: '과세 유형 결정',
        detail: '간이과세자 vs 일반과세자 (연매출 8,000만 원 기준)',
      },
      {
        id: 'f4',
        text: '3개월치 운전자금 확보',
        detail: '임대료·공과금·소모품 비용 대비',
      },
    ],
  },
  {
    id: 'insurance',
    title: '보험',
    emoji: '🛡️',
    accent: 'pink',
    bgLight: '#fdf2f8',
    borderColor: '#fbcfe8',
    textColor: '#9d174d',
    checkColor: '#ec4899',
    progressColor: '#f472b6',
    items: [
      {
        id: 'i1',
        text: '영업배상책임보험 가입',
        detail: '시술 중 고객 부작용·사고 대비 (사실상 필수)',
      },
      {
        id: 'i2',
        text: '화재보험 (임차인 배상책임) 가입',
        detail: '건물주 요구 여부 및 보장 범위 확인',
      },
    ],
  },
  {
    id: 'marketing',
    title: '마케팅 & 오픈 준비',
    emoji: '📱',
    accent: 'fuchsia',
    bgLight: '#fdf4ff',
    borderColor: '#f0abfc',
    textColor: '#86198f',
    checkColor: '#c026d3',
    progressColor: '#d946ef',
    items: [
      {
        id: 'm1',
        text: '네이버 플레이스 등록',
        detail: '지역 검색 노출의 핵심 채널',
      },
      {
        id: 'm2',
        text: '인스타그램 계정 개설',
        detail: '시술 전후 사진·릴스로 신규 고객 유입',
      },
      {
        id: 'm3',
        text: '네이버 블로그 개설',
        detail: '후기·정보성 글로 SEO 효과',
      },
      {
        id: 'm4',
        text: '서비스 메뉴판(가격표) 작성',
        detail: '시술별 소요 시간과 가격 명확히 정리',
      },
      {
        id: 'm5',
        text: '오픈 이벤트 기획',
        detail: '첫 달 할인, 지인 소개 이벤트 등',
      },
    ],
  },
]

export const totalItems = sections.reduce((sum, s) => sum + s.items.length, 0)
