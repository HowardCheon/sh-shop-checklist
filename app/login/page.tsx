import PinLogin from '@/components/PinLogin'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams
  return <PinLogin next={next ?? '/'} />
}
