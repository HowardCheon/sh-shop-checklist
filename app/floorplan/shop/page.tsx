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
