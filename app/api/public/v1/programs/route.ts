import { publicApi } from '@/lib/public-api'
import { getPrograms } from '@/lib/booking/service'

/* 전체 프로그램 목록 */
export const GET = publicApi(async () => ({ programs: await getPrograms() }))
