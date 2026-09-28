// 사용법: node scripts/run-sql.mjs <file.sql | "SQL문">
import fs from 'node:fs'

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const arg = process.argv[2]
const query = fs.existsSync(arg) ? fs.readFileSync(arg, 'utf8') : arg
const ref = process.env.SUPABASE_PROJECT_REF || 'jzrdajrymxxwmeizxyck'
const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }),
})
const text = await res.text()
console.log(res.status, text)
if (!res.ok) process.exit(1)
