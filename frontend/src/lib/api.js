const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export async function startScan(urlA, urlB) {
  const res = await fetch(`${BASE}/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url_a: urlA, url_b: urlB || undefined }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to start scan')
  }
  return res.json()
}

export async function getScan(scanId) {
  const res = await fetch(`${BASE}/scan/${scanId}`)
  if (!res.ok) throw new Error('Scan not found')
  return res.json()
}

export async function getReport(scanId) {
  const res = await fetch(`${BASE}/scan/${scanId}/report`)
  if (!res.ok) throw new Error('Report not ready')
  return res.json()
}

export async function listScans() {
  const res = await fetch(`${BASE}/scan`)
  if (!res.ok) throw new Error('Failed to load scans')
  return res.json()
}
