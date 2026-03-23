/**
 * Build a structured JSON report from scan results.
 */
export function buildJsonReport({ scanId, urlA, urlB, resultsA, resultsB }) {
  const summarize = (results) => {
    if (!results) return null
    const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 }
    const byType = {}
    for (const issue of results.issues) {
      bySeverity[issue.severity] = (bySeverity[issue.severity] || 0) + 1
      byType[issue.type] = (byType[issue.type] || 0) + 1
    }
    return { totalIssues: results.issues.length, bySeverity, byType }
  }

  return {
    scanId,
    generatedAt: new Date().toISOString(),
    urls: { a: urlA, b: urlB || null },
    summary: {
      a: summarize(resultsA),
      b: summarize(resultsB),
    },
    results: {
      a: resultsA
        ? {
            seo: resultsA.seo,
            issues: resultsA.issues,
          }
        : null,
      b: resultsB
        ? {
            seo: resultsB.seo,
            issues: resultsB.issues,
          }
        : null,
    },
  }
}

/**
 * Build an HTML report from scan results.
 */
export function buildHtmlReport({ report, screenshotUrlA, screenshotUrlB }) {
  const { urls, summary, results } = report

  const severityBadge = (s) => {
    const colors = {
      critical: '#ef4444',
      high: '#f97316',
      medium: '#f59e0b',
      low: '#6b7280',
    }
    return `<span style="background:${colors[s] || '#6b7280'};color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;text-transform:uppercase">${s}</span>`
  }

  const issueRows = (issues) =>
    issues
      .map(
        (i) => `
    <tr>
      <td>${severityBadge(i.severity)}</td>
      <td><code>${i.type}</code></td>
      <td style="max-width:280px;word-break:break-all;font-size:12px">${escHtml(i.description)}</td>
      <td style="max-width:200px;font-size:11px;color:#6b7280">${escHtml(i.location)}</td>
      <td style="font-size:12px">${escHtml(i.suggested_fix)}</td>
    </tr>`
      )
      .join('')

  const seoTable = (seo) => {
    if (!seo) return '<p>No SEO data.</p>'
    return `
      <table class="info-table">
        <tr><th>Field</th><th>Value</th></tr>
        <tr><td>Title</td><td>${escHtml(seo.title || '—')}</td></tr>
        <tr><td>Description</td><td>${escHtml(seo.description || '—')}</td></tr>
        <tr><td>Canonical</td><td>${escHtml(seo.canonical || '—')}</td></tr>
        <tr><td>H1(s)</td><td>${escHtml((seo.h1 || []).join(', ') || '—')}</td></tr>
        <tr><td>Images without alt</td><td>${seo.imagesWithoutAlt?.length ?? 0} / ${seo.totalImages ?? 0}</td></tr>
      </table>`
  }

  const urlSection = (label, url, res, summary, screenshotUrl) => {
    if (!res) return ''
    return `
    <section>
      <h2>${label}: <a href="${escHtml(url)}" target="_blank">${escHtml(url)}</a></h2>
      <div class="stats">
        <div class="stat critical">${summary?.bySeverity?.critical ?? 0}<span>Critical</span></div>
        <div class="stat high">${summary?.bySeverity?.high ?? 0}<span>High</span></div>
        <div class="stat medium">${summary?.bySeverity?.medium ?? 0}<span>Medium</span></div>
        <div class="stat low">${summary?.bySeverity?.low ?? 0}<span>Low</span></div>
      </div>
      ${screenshotUrl ? `<div class="screenshot-wrap"><img src="${screenshotUrl}" alt="Screenshot of ${label}" class="screenshot"/></div>` : ''}
      <h3>SEO</h3>
      ${seoTable(res.seo)}
      <h3>Issues (${res.issues.length})</h3>
      ${
        res.issues.length === 0
          ? '<p class="no-issues">No issues found.</p>'
          : `<table class="issues-table">
              <thead><tr><th>Severity</th><th>Type</th><th>Description</th><th>Location</th><th>Suggested fix</th></tr></thead>
              <tbody>${issueRows(res.issues)}</tbody>
             </table>`
      }
    </section>`
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>QA Report — ${escHtml(urls.a)}</title>
<style>
  :root{--bg:#0f1117;--surface:#1a1d27;--border:#2a2d3a;--text:#e2e8f0;--muted:#6b7280;--font:'Segoe UI',system-ui,sans-serif}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--text);font-family:var(--font);font-size:14px;line-height:1.6;padding:2rem}
  header{margin-bottom:2rem;border-bottom:1px solid var(--border);padding-bottom:1rem}
  header h1{font-size:1.4rem;margin-bottom:.25rem}
  header p{color:var(--muted);font-size:.85rem}
  section{margin-bottom:3rem;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:1.5rem}
  h2{font-size:1.1rem;margin-bottom:1rem;color:#93c5fd}
  h3{font-size:.9rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:1.5rem 0 .75rem}
  .stats{display:flex;gap:.75rem;margin-bottom:1.25rem;flex-wrap:wrap}
  .stat{display:flex;flex-direction:column;align-items:center;padding:.6rem 1.2rem;border-radius:8px;font-size:1.8rem;font-weight:700}
  .stat span{font-size:.7rem;font-weight:400;text-transform:uppercase;letter-spacing:.08em;margin-top:.15rem}
  .stat.critical{background:#450a0a;color:#ef4444}
  .stat.high{background:#431407;color:#f97316}
  .stat.medium{background:#451a03;color:#f59e0b}
  .stat.low{background:#1f2937;color:#6b7280}
  .issues-table{width:100%;border-collapse:collapse;font-size:13px}
  .issues-table th{text-align:left;padding:.5rem .75rem;font-size:.75rem;color:var(--muted);text-transform:uppercase;border-bottom:1px solid var(--border)}
  .issues-table td{padding:.5rem .75rem;border-bottom:1px solid var(--border);vertical-align:top}
  .issues-table tr:hover td{background:rgba(255,255,255,.03)}
  .info-table{border-collapse:collapse;width:100%;font-size:13px}
  .info-table th{text-align:left;padding:.4rem .75rem;font-size:.75rem;color:var(--muted);border-bottom:1px solid var(--border)}
  .info-table td{padding:.4rem .75rem;border-bottom:1px solid var(--border)}
  code{background:#1e2130;padding:2px 6px;border-radius:4px;font-size:12px;font-family:monospace}
  .no-issues{color:#22c55e;padding:.5rem 0}
  a{color:#60a5fa;text-decoration:none}a:hover{text-decoration:underline}
  .screenshot-wrap{margin:1rem 0;border:1px solid var(--border);border-radius:8px;overflow:hidden;max-height:400px;overflow-y:auto}
  .screenshot{width:100%;display:block}
</style>
</head>
<body>
<header>
  <h1>QA Audit Report</h1>
  <p>Generated: ${new Date().toLocaleString()} &nbsp;|&nbsp; Scan ID: ${report.scanId}</p>
</header>
${urlSection('URL A', urls.a, results.a, summary.a, screenshotUrlA)}
${urls.b ? urlSection('URL B', urls.b, results.b, summary.b, screenshotUrlB) : ''}
</body>
</html>`
}

function escHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
