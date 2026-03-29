/**
 * Email service using Resend
 * Handles: regression alerts + weekly digest
 */

const RESEND_API = 'https://api.resend.com/emails'
const FROM = 'Lintry <alerts@lintry.io>'
const FROM_FALLBACK = 'Lintry <onboarding@resend.dev>'

async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[email] No RESEND_API_KEY — skipping email')
    return null
  }

  const from = process.env.LINTRY_DOMAIN_VERIFIED ? FROM : FROM_FALLBACK

  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ from, to, subject, html }),
  })

  const data = await res.json()
  if (!res.ok) {
    console.error('[email] Send failed:', data)
    return null
  }

  console.log(`[email] Sent to ${to}: ${subject}`)
  return data
}

/**
 * Send regression alert when a scheduled scan finds new critical/high issues.
 */
export async function sendRegressionAlert({ to, projectName, siteUrl, scanId, diff, scoreA, appUrl }) {
  if (!to) return null

  const newCritical = diff?.newIssues?.filter(i => i.severity === 'critical') || []
  const newHigh = diff?.newIssues?.filter(i => i.severity === 'high') || []
  const totalNew = diff?.new || 0
  const totalFixed = diff?.resolved || 0

  const subject = `⚠️ ${totalNew} new issue${totalNew !== 1 ? 's' : ''} found on ${projectName}`

  const issueRows = [...newCritical, ...newHigh].slice(0, 5).map(issue => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #2a2d3a">
        <span style="background:${issue.severity === 'critical' ? '#450a0a' : '#431407'};color:${issue.severity === 'critical' ? '#ef4444' : '#f97316'};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;text-transform:uppercase">${issue.severity}</span>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #2a2d3a;color:#e2e8f0;font-size:13px">${issue.description}</td>
    </tr>
  `).join('')

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px">

    <!-- Header -->
    <div style="margin-bottom:32px">
      <span style="font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.5px">Lintry</span>
      <span style="font-size:13px;color:#6b7280;margin-left:8px">QA Monitor</span>
    </div>

    <!-- Alert box -->
    <div style="background:#1a1d27;border:1px solid #f97316;border-radius:12px;padding:24px;margin-bottom:24px">
      <div style="font-size:16px;font-weight:600;color:#f97316;margin-bottom:8px">New issues detected</div>
      <div style="font-size:14px;color:#9ca3af">
        A scheduled scan of <a href="${siteUrl}" style="color:#60a5fa;text-decoration:none">${projectName}</a> found new problems.
      </div>
    </div>

    <!-- Stats row -->
    <div style="display:flex;gap:12px;margin-bottom:24px">
      <div style="flex:1;background:#1a1d27;border:1px solid #2a2d3a;border-radius:10px;padding:16px;text-align:center">
        <div style="font-size:28px;font-weight:700;color:#ef4444">${totalNew}</div>
        <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-top:4px">New issues</div>
      </div>
      <div style="flex:1;background:#1a1d27;border:1px solid #2a2d3a;border-radius:10px;padding:16px;text-align:center">
        <div style="font-size:28px;font-weight:700;color:#22c55e">${totalFixed}</div>
        <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-top:4px">Fixed</div>
      </div>
      <div style="flex:1;background:#1a1d27;border:1px solid #2a2d3a;border-radius:10px;padding:16px;text-align:center">
        <div style="font-size:28px;font-weight:700;color:${scoreA >= 80 ? '#22c55e' : scoreA >= 60 ? '#f59e0b' : '#ef4444'}">${scoreA ?? '—'}</div>
        <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-top:4px">QA Score</div>
      </div>
    </div>

    <!-- Top issues -->
    ${issueRows ? `
    <div style="background:#1a1d27;border:1px solid #2a2d3a;border-radius:10px;overflow:hidden;margin-bottom:24px">
      <div style="padding:12px 16px;border-bottom:1px solid #2a2d3a;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em">Top issues</div>
      <table style="width:100%;border-collapse:collapse">
        ${issueRows}
      </table>
    </div>` : ''}

    <!-- CTA -->
    <div style="text-align:center;margin-bottom:32px">
      <a href="${appUrl}/scan/${scanId}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600">
        View full report →
      </a>
    </div>

    <!-- Footer -->
    <div style="border-top:1px solid #2a2d3a;padding-top:20px;font-size:12px;color:#4b5563;text-align:center">
      Sent by Lintry · <a href="${appUrl}" style="color:#4b5563">lintry.io</a>
    </div>
  </div>
</body>
</html>`

  return sendEmail({ to, subject, html })
}

/**
 * Send weekly digest email summarizing all projects.
 */
export async function sendWeeklyDigest({ to, projects, appUrl }) {
  if (!to || !projects?.length) return null

  const subject = `📊 Weekly QA digest — ${projects.length} site${projects.length !== 1 ? 's' : ''} monitored`

  const projectRows = projects.map(p => `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #2a2d3a">
        <div style="font-weight:600;color:#e2e8f0;font-size:14px">${p.name}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:2px">${p.url}</div>
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #2a2d3a;text-align:center">
        <span style="font-size:20px;font-weight:700;color:${p.score >= 80 ? '#22c55e' : p.score >= 60 ? '#f59e0b' : '#ef4444'}">${p.score ?? '—'}</span>
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #2a2d3a;text-align:center">
        <span style="color:#ef4444;font-weight:600">${p.openIssues ?? 0}</span>
        <span style="color:#6b7280;font-size:12px"> open</span>
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #2a2d3a;text-align:center">
        <a href="${appUrl}/projects/${p.id}" style="color:#60a5fa;font-size:13px;text-decoration:none">View →</a>
      </td>
    </tr>
  `).join('')

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px">

    <div style="margin-bottom:32px">
      <span style="font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.5px">Lintry</span>
      <span style="font-size:13px;color:#6b7280;margin-left:8px">Weekly digest</span>
    </div>

    <div style="font-size:18px;font-weight:600;color:#fff;margin-bottom:8px">Your weekly QA summary</div>
    <div style="font-size:14px;color:#9ca3af;margin-bottom:24px">
      Here's how your monitored sites are performing this week.
    </div>

    <div style="background:#1a1d27;border:1px solid #2a2d3a;border-radius:10px;overflow:hidden;margin-bottom:24px">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#111827">
            <th style="padding:10px 16px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em">Site</th>
            <th style="padding:10px 16px;text-align:center;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em">Score</th>
            <th style="padding:10px 16px;text-align:center;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em">Issues</th>
            <th style="padding:10px 16px;text-align:center;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em">Report</th>
          </tr>
        </thead>
        <tbody>${projectRows}</tbody>
      </table>
    </div>

    <div style="text-align:center;margin-bottom:32px">
      <a href="${appUrl}/projects" style="display:inline-block;background:#1a1d27;border:1px solid #374151;color:#e2e8f0;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px">
        View all projects →
      </a>
    </div>

    <div style="border-top:1px solid #2a2d3a;padding-top:20px;font-size:12px;color:#4b5563;text-align:center">
      Sent by Lintry · <a href="${appUrl}" style="color:#4b5563">lintry.io</a>
    </div>
  </div>
</body>
</html>`

  return sendEmail({ to, subject, html })
}
