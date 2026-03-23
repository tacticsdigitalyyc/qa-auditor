import PQueue from 'p-queue'
import { v4 as uuid } from 'uuid'
import supabase from '../utils/supabase.js'
import { scanUrl } from '../services/scanner.js'
import { buildJsonReport, buildHtmlReport } from '../services/reporter.js'

const queue = new PQueue({ concurrency: 2 })
const progress = new Map()

export function getProgress(scanId) {
  return progress.get(scanId) ?? 0
}

export function enqueueJob(scanId, urlA, urlB) {
  queue.add(() => runJob(scanId, urlA, urlB))
}

async function runJob(scanId, urlA, urlB) {
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

    const screenshotUrlA = await uploadScreenshot(scanId, 'a', resultsA.screenshotBuffer)
    const screenshotUrlB = urlB ? await uploadScreenshot(scanId, 'b', resultsB?.screenshotBuffer) : null

    progress.set(scanId, 88)

    const jsonReport = buildJsonReport({ scanId, urlA, urlB, resultsA, resultsB })
    const htmlReport = buildHtmlReport({ report: jsonReport, screenshotUrlA, screenshotUrlB })

    const htmlPath = `reports/${scanId}/report.html`
    await supabase.storage.from('screenshots').upload(htmlPath, Buffer.from(htmlReport), {
      contentType: 'text/html',
      upsert: true,
    })
    const { data: htmlPublic } = supabase.storage.from('screenshots').getPublicUrl(htmlPath)

    progress.set(scanId, 93)

    const allIssues = [
      ...resultsA.issues.map((i) => ({ ...i, scan_id: scanId, url_target: urlA, id: uuid() })),
      ...(resultsB?.issues.map((i) => ({ ...i, scan_id: scanId, url_target: urlB, id: uuid() })) ?? []),
    ]
    if (allIssues.length > 0) {
      await supabase.from('issues').insert(allIssues)
    }

    await supabase.from('reports').insert({
      id: uuid(),
      scan_id: scanId,
      screenshot_a: screenshotUrlA,
      screenshot_b: screenshotUrlB,
      seo_a: resultsA.seo,
      seo_b: resultsB?.seo ?? null,
      html_report_path: htmlPublic?.publicUrl ?? null,
      json_report: jsonReport,
    })

    await supabase
      .from('scans')
      .update({ status: 'done', completed_at: new Date().toISOString() })
      .eq('id', scanId)

    progress.set(scanId, 100)
    console.log(`[${scanId}] Scan complete.`)
  } catch (err) {
    console.error(`[${scanId}] Scan failed:`, err.message)
    await supabase
      .from('scans')
      .update({ status: 'failed', error: err.message })
      .eq('id', scanId)
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
  if (error) {
    console.error('Screenshot upload error:', error.message)
    return null
  }
  const { data } = supabase.storage.from('screenshots').getPublicUrl(path)
  return data?.publicUrl ?? null
}
