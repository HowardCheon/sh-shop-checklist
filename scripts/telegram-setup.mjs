// 예약 알림 봇 설정 도우미
// 1) .env.local 에 토큰 추가 (1순위: TELEGRAM_PRIMARY_BOT_TOKEN, 2순위: TELEGRAM_BOT_TOKEN)
// 2) 텔레그램에서 그 봇에게 아무 메시지 전송
// 3) node scripts/telegram-setup.mjs [primary]  → 채팅 ID 를 찾아 .env.local 에 저장하고 테스트 메시지 발송
import fs from 'node:fs'

const P = process.argv[2] === 'primary' ? 'TELEGRAM_PRIMARY_' : 'TELEGRAM_'
const file = '.env.local'
let text = fs.readFileSync(file, 'utf8')
const get = k => (text.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]
const token = get(P + 'BOT_TOKEN')
if (!token) { console.log(`.env.local 에 ${P}BOT_TOKEN 이 없습니다.`); process.exit(1) }

const api = (method, body) => fetch(`https://api.telegram.org/bot${token}/${method}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
}).then(r => r.json())

const me = await api('getMe')
if (!me.ok) { console.log('토큰이 올바르지 않습니다:', me.description); process.exit(1) }
console.log(`봇: @${me.result.username}`)

let chatId = get(P + 'CHAT_ID')
if (!chatId) {
  const upd = await api('getUpdates')
  const chats = [...new Map((upd.result || [])
    .map(u => u.message?.chat || u.my_chat_member?.chat || u.channel_post?.chat)
    .filter(Boolean).map(c => [c.id, c])).values()]
  if (!chats.length) { console.log('봇에게 받은 메시지가 없습니다. 텔레그램에서 봇에게 아무 메시지나 보낸 뒤 다시 실행하세요.'); process.exit(1) }
  if (chats.length > 1) console.log('여러 대화방 발견 — 가장 최근 것을 사용:', chats.map(c => `${c.id}(${c.title || c.first_name || ''})`).join(', '))
  const chat = chats[chats.length - 1]
  chatId = String(chat.id)
  text += `${text.endsWith('\n') ? '' : '\n'}${P}CHAT_ID=${chatId}\n`
  fs.writeFileSync(file, text)
  console.log(`채팅 ID 저장: ${chatId} (${chat.title || chat.first_name || ''})`)
}

const sent = await api('sendMessage', { chat_id: chatId, text: '✅ 온:플로우 예약 알림 봇이 연결되었습니다.' })
console.log(sent.ok ? '테스트 메시지 발송 완료' : `발송 실패: ${sent.description}`)
