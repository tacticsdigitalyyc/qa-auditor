import PQueue from 'p-queue'
import { v4 as uuid } from 'uuid'
import supabase from '../utils/supabase.js'
import { scanUrl } from '../services/scanner.js'
import { buildJsonReport, buildHtmlReport } from '../services/reporter.js'
import { fingerprint, computeScore, diffIssues, summarizeDiff } from '../services/diff.js'
import { enrichIssues } from '../services/explainer.js'

const queue = new PQueue({ concurrency: 2 })
const progress = new Map()

export function getProgress(scanId) {
  return progress.get(scanId) ?? 0
}

export function enqueueJob(scanId, urlA, urlB, projectId) {
  queue.add(() => runJob(scanId, urlA, urlB, projectId))
}

async function runJob(scanId, urlA, urlB, projectId) {
  progress.set(scanId, 5)

  try {
    await supabase.from('scans').update({ status: 'running' }).eq('id', scanId)
    progress.set(scanId, 10)

    console.log(`[${scanId}] Scanning URL A: ${urlA}`)
    const resultsA = await scanUrl(urlA)
    progress.set(scanId, urlB ? 45 : 75)

    let resultsB = null
    if (urlB) {
      console.log(`[${scanId}] Scanning URL B: ${urlB}`)
      resultsB = await scanUrl(urlB)
      progress.set(scanId, 80)
    }

    // Fingerprint all issues
    const fingerprintedA = resultsA.issues.map(i => ({
      ...i,
      fingerprint: fingerprint({ ...i, url_target: urlA }),
    }))
    const fingerprintedB = resultsB
      ? resultsB.issues.map(i => ({
          ...i,
          fingerprint: fingerprint({ ...i, url_target: urlB }),
        }))
      : []

    // AI enrichment — adds impact, steps, code example, effort to each issue
    console.log(`[${scanId}] Enriching issues with AI explanations...`)
    const enrichedA = await enrichIssues(fingerprintedA.map(i => ({ ...i, url_target: urlA })))
    const enrichedB = resultsB ? await enrichIssues(fingerprintedB.map(i => ({ ...i, url_target: urlB }))) : []

    // Compute QA scores
    const scoreA = computeScore(enrichedA)
    const scoreB = resultsB ? computeScore(enrichedB) : null

    // Load previous scan issues for this project (for diff)
    let diffSummary = null
    if (projectId) {
      const { data: prevScans } = await supabase
        .from('scans')
        .select('id')
        .eq('project_id', projectId)
        .eq('status', 'done')
        .neq('id', scanId)
        .order('created_at', { ascending: false })
        .limit(1)

      if (prevScans && prevScans.length > 0) {
        const prevScanId = prevScans[0].id
        const { data: prevIssues } = await supabase
          .from('issues')
          .select('*')
          .eq('scan_id', prevScanId)
          .eq('url_target', urlA)

        if (prevIssues && prevIssues.length > 0) {
          const diff = diffIssues(prevIssues, fingerprintedA)
          diffSummary = summarizeDiff(diff)

          // Mark resolved issues from previous scan
          if (diff.resolved.length > 0) {
            const resolvedFingerprints = diff.resolved.map(i => i.fingerprint)
            await supabase
              .from('issues')
              .update({ status: 'resolved', resolved_in_scan_id: scanId })
              .eq('scan_id', prevScanId)
              .in('fingerprint', resolvedFingerprints)
          }
        }
      }
    }

    progress.set(scanId, 88)

    // Upload screenshots
    const screenshotUrlA = await uploadScreenshot(scanId, 'a', resultsA.screenshotBuffer)
    const screenshotUrlB = urlB ? await uploadScreenshot(scanId, 'b', resultsB?.screenshotBuffer) : null

    // Build reports
    const jsonReport = buildJsonReport({ scanId, urlA, urlB, resultsA: { ...resultsA, issues: enrichedA }, resultsB: resultsB ? { ...resultsB, issues: enrichedB } : null, scoreA, scoreB, diffSummary })
    const htmlReport = buildHtmlReport({ report: jsonReport, screenshotUrlA, screenshotUrlB })

    const htmlPath = `reports/${scanId}/report.html`
    await supabase.storage.from('screenshots').upload(htmlPath, Buffer.from(htmlReport), {
      contentType: 'text/html',
      upsert: true,
    })
    const { data: htmlPublic } = supabase.storage.from('screenshots').getPublicUrl(htmlPath)

    progress.set(scanId, 93)

    // Write issues with fingerprints
    const allIssues = [
      ...enrichedA.map(i => ({ ...i, scan_id: scanId, url_target: urlA, id: uuid(), status: 'open' })),
      ...enrichedB.map(i => ({ ...i, scan_id: scanId, url_target: urlB, id: uuid(), status: 'open' })),
    ]
    if (allIssues.length > 0) await supabase.from('issues').insert(allIssues)

    // Write report
    await supabase.from('reports').insert({
      id: uuid(),
      scan_id: scanId,
      screenshot_a: screenshotUrlA,
      screenshot_b: screenshotUrlB,
      seo_a: resultsA.seo,
      seo_b: resultsB?.seo ?? null,
      html_report_path: htmlPublic?.publicUrl ?? null,
      json_report: jsonReport,
      score_a: scoreA,
      score_b: scoreB,
      diff: diffSummary,
    })

    // Update project last_scanned_at
    if (projectId) {
      await supabase
        .from('projects')
        .update({ last_scanned_at: new Date().toISOString() })
        .eq('id', projectId)
    }

    await supabase
      .from('scans')
      .update({ status: 'done', completed_at: new Date().toISOString() })
      .eq('id', scanId)

    progress.set(scanId, 100)
    console.log(`[${scanId}] Scan complete. Score: ${scoreA}`)
  } catch (err) {
    console.error(`[${scanId}] Scan failed:`, err.message)
    await supabase.from('scans').update({ status: 'failed', error: err.message }).eq('id', scanId)
    progress.set(scanId, -1)
  }
}

async function uploadScreenshot(scanId, label, buffer) {
  if (!buffer) return null
  const path = `screenshots/${scanId}/${label}.png`
  const { error } = await supabase.storage.from('screenshots').upload(path, buffer, {
    contentType: 'image/png',
    upsert: true,
  })
  if (error) { console.error('Screenshot upload error:', error.message); return null }
  const { data } = supabase.storage.from('screenshots').getPublicUrl(path)
  return data?.publicUrl ?? null
}
