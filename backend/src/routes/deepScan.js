import { Router } from 'express'
import supabase from '../utils/supabase.js'
import { getBrowser } from '../utils/browser.js'
import { checkGoogleSafeBrowsing, computeUniquenessScore } from '../services/contentChecker.js'

const router = Router()

/**
 * POST /deep-scan/:scanId
 * Runs additional deep checks on an existing completed scan.
 * - Google Safe Browsing check on all outbound links
 * - Content uniqueness scoring
 * - Full redirect chain analysis
 */
router.post('/:scanId', async (req, res) => {
  const { scanId } = req.params

  // Verify scan exists and is done
  const { data: scan, error } = await supabase
    .from('scans')
    .select('id, url_a, url_b, status')
    .eq('id', scanId)
    .single()

  if (error || !scan) return res.status(404).json({ error: 'Scan not found' })
  if (scan.status !== 'done') return res.status(400).json({ error: 'Scan must be completed before deep scan' })

  res.json({ message: 'Deep scan started', scanId })

  // Run async — don't block the response
  runDeepScan(scanId, scan.url_a, scan.url_b).catch(err =>
    console.error(`[deep-scan] Failed for ${scanId}:`, err.message)
  )
})

async function runDeepScan(scanId, urlA, urlB) {
  console.log(`[deep-scan] Starting for scan ${scanId}`)
  const newIssues = []

  const browser = await getBrowser()

  for (const url of [urlA, urlB].filter(Boolean)) {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ignoreHTTPSErrors: true,
    })
    const page = await context.newPage()

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 })

      // Extract all outbound links
      const outboundUrls = await page.evaluate((pageUrl) => {
        const domain = new URL(pageUrl).hostname
        return Array.from(document.querySelectorAll('a[href]'))
          .map(a => a.href)
          .filter(href => {
            try {
              return new URL(href).hostname !== domain &&
                href.startsWith('http')
            } catch { return false }
          })
      }, url)

      // Extract page text for uniqueness
      const pageText = await page.evaluate(() => document.body?.innerText || '')

      // Google Safe Browsing check
      const safeBrowsingIssues = await checkGoogleSafeBrowsing(outboundUrls)
      newIssues.push(...safeBrowsingIssues.map(i => ({
        ...i,
        scan_id: scanId,
        url_target: url,
        status: 'open',
        deep_scan: true,
      })))

      // Content uniqueness (self-check — compare sections of the page)
      const sections = await page.evaluate(() =>
        Array.from(document.querySelectorAll('section, article, .content, main'))
          .map(el => el.innerText?.trim() || '')
          .filter(t => t.length > 200)
      )

      if (sections.length > 1) {
        const uniquenessScore = computeUniquenessScore(sections[0], sections.slice(1))
        if (uniquenessScore < 50) {
          newIssues.push({
            scan_id: scanId,
            url_target: url,
            type: 'content_quality',
            severity: 'high',
            location: 'body sections',
            description: `Low content uniqueness score: ${uniquenessScore}/100. Page sections are ${100 - uniquenessScore}% similar to each other — likely duplicate or templated content.`,
            suggested_fix: 'Rewrite repeated sections with unique content. Each section should address a distinct topic or angle.',
            meta: { uniquenessScore },
            status: 'open',
            deep_scan: true,
          })
        }
      }

      // Redirect chain analysis
      const redirectIssues = await checkRedirectChains(outboundUrls.slice(0, 50)) // limit to 50
      newIssues.push(...redirectIssues.map(i => ({
        ...i,
        scan_id: scanId,
        url_target: url,
        status: 'open',
        deep_scan: true,
      })))

    } catch (err) {
      console.error(`[deep-scan] Page error for ${url}:`, err.message)
    } finally {
      await context.close()
    }
  }

  // Save new issues to DB
  if (newIssues.length > 0) {
    const { error } = await supabase.from('issues').insert(
      newIssues.map(i => ({ ...i, id: crypto.randomUUID() }))
    )
    if (error) console.error('[deep-scan] DB insert error:', error.message)
  }

  console.log(`[deep-scan] Complete for ${scanId}. Found ${newIssues.length} additional issues.`)
}

async function checkRedirectChains(urls) {
  const issues = []

  for (const url of urls) {
    try {
      const chain = []
      let current = url
      let hops = 0
      const MAX_HOPS = 10

      while (hops < MAX_HOPS) {
        const res = await fetch(current, {
          method: 'HEAD',
          redirect: 'manual',
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Lintry/1.0)' },
          signal: AbortSignal.timeout(5000),
        })

        chain.push({ url: current, status: res.status })

        if (res.status >= 300 && res.status < 400) {
          const location = res.headers.get('location')
          if (!location) break
          current = location.startsWith('http') ? location : new URL(location, current).href
          hops++
        } else {
          break
        }
      }

      // Flag chains longer than 3 hops
      if (chain.length > 3) {
        issues.push({
          type: 'security',
          severity: 'medium',
          location: `a[href="${url}"]`,
          description: `Long redirect chain detected (${chain.length} hops): ${url} → ... → ${chain[chain.length - 1]?.url}`,
          suggested_fix: 'Update the link to point directly to the final destination. Long redirect chains slow page load and can mask malicious destinations.',
          meta: { chain, hops: chain.length },
        })
      }

      // Flag if chain ends on a different domain than it started
      if (chain.length > 1) {
        try {
          const startDomain = new URL(url).hostname
          const endDomain = new URL(chain[chain.length - 1].url).hostname
          if (startDomain !== endDomain) {
            const suspicious = SUSPICIOUS_TLDS_CHECK(endDomain)
            if (suspicious) {
              issues.push({
                type: 'security',
                severity: 'high',
                location: `a[href="${url}"]`,
                description: `Redirect chain leads to suspicious domain: ${url} ultimately redirects to ${endDomain}`,
                suggested_fix: 'Remove or update this link. Redirect chains ending on suspicious domains are a common phishing technique.',
                meta: { originalUrl: url, finalUrl: chain[chain.length - 1].url, chain },
              })
            }
          }
        } catch { /* ignore parse errors */ }
      }
    } catch { /* skip unreachable URLs */ }
  }

  return issues
}

function SUSPICIOUS_TLDS_CHECK(domain) {
  const suspicious = ['.tk', '.ml', '.ga', '.cf', '.gq', '.xyz', '.top', '.click']
  return suspicious.some(tld => domain.endsWith(tld))
}

export default router
