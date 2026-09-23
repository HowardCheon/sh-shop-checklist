import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #cb9175, #a5624a)',
        borderRadius: '8px',
      }}
    >
      <div style={{ width: '12px', height: '12px', background: '#fff', transform: 'rotate(45deg)' }} />
    </div>,
    { ...size }
  )
}
