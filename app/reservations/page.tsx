import { redirect } from 'next/navigation'

// 예약 화면은 메인(/)으로 이동
export default function ReservationsPage() {
  redirect('/')
}
