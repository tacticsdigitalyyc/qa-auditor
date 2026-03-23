import { getBrowser } from '../utils/browser.js'

const PAGE_TIMEOUT = 20000
const LINK_TIMEOUT = 10000

/**
 * Run a full QA scan on a single URL.
 * Returns { issues[], seo{}, screenshotBuffer }
 */
export async function scanUrl(url) {
  const browser = await getBrowser()
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (compatible; QAAuditor/1.0)',
    ignoreHTTPSErrors: true,
  })
  const page = await context.newPage()

  const issues = []
  const consoleErrors = []
  const failedRequests = []

  // ── Console error capture ────────────────────────────────────────────────
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push({
        text: msg.text(),
        location: msg.location(),
      })
    }
  })

  page.on('pageerror', (err) => {
    consoleErrors.push({ text: err.message, stack: err.stack })
  })

  // ── Failed network requests ──────────────────────────────────────────────
  page.on('requestfailed', (req) => {
    failedRequests.push({
      url: req.url(),
      method: req.method(),
      failure: req.failure()?.errorText,
    })
  })

  // ── Navigate ─────────────────────────────────────────────────────────────
  let navStatus = 200
  try {
    const res = await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: PAGE_TIMEOUT,
    })
    navStatus = res?.status() ?? 0
  } catch (err) {
    await context.close()
    throw new Error(`Failed to load ${url}: ${err.message}`)
  }

  if (navStatus >= 400) {
    issues.push({
      type: 'broken_link',
      severity: 'critical',
      location: url,
      description: `Page returned HTTP ${navStatus}`,
      suggested_fix: 'Verify the URL is correct and the server is running.',
      meta: { status: navStatus },
    })
  }

  // ── Screenshot ────────────────────────────────────────────────────────────
  const screenshotBuffer = await page.screenshot({ fullPage: true }).catch(() => null)

  // ── SEO extraction ────────────────────────────────────────────────────────
  const seo = await page.evaluate(() => {
    const getMeta = (name) =>
      document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ||
      document.querySelector(`meta[property="${name}"]`)?.getAttribute('content') ||
      null

    const headings = {}
    for (let i = 1; i <= 6; i++) {
      headings[`h${i}`] = Array.from(document.querySelectorAll(`h${i}`)).map((el) => el.innerText.trim())
    }

    const images = Array.from(document.querySelectorAll('img'))
    const imagesWithoutAlt = images.filter((img) => !img.getAttribute('alt')).map((img) => ({
      src: img.src,
      selector: img.outerHTML.slice(0, 120),
    }))

    return {
      title: document.title || null,
      description: getMeta('description') || getMeta('og:description'),
      canonical: document.querySelector('link[rel="canonical"]')?.href || null,
      h1: headings.h1,
      h2: headings.h2,
      h3: headings.h3,
      headings,
      imagesWithoutAlt,
      totalImages: images.length,
    }
  })

  // ── SEO issues ────────────────────────────────────────────────────────────
  if (!seo.title) {
    issues.push({
      type: 'seo',
      severity: 'high',
      location: '<head>',
      description: 'Missing <title> tag.',
      suggested_fix: 'Add a descriptive <title> tag to the <head> of the page.',
      meta: {},
    })
  } else if (seo.title.length < 30 || seo.title.length > 60) {
    issues.push({
      type: 'seo',
      severity: 'medium',
      location: '<title>',
      description: `Title length is ${seo.title.length} characters (ideal: 30–60).`,
      suggested_fix: 'Adjust title length to between 30 and 60 characters.',
      meta: { title: seo.title },
    })
  }

  if (!seo.description) {
    issues.push({
      type: 'seo',
      severity: 'high',
      location: '<head>',
      description: 'Missing meta description.',
      suggested_fix: 'Add a <meta name="description"> tag with 120–160 characters.',
      meta: {},
    })
  } else if (seo.description.length < 120 || seo.description.length > 160) {
    issues.push({
      type: 'seo',
      severity: 'low',
      location: 'meta[name="description"]',
      description: `Meta description length is ${seo.description.length} characters (ideal: 120–160).`,
      suggested_fix: 'Adjust meta description to between 120 and 160 characters.',
      meta: { description: seo.description },
    })
  }

  if (!seo.h1 || seo.h1.length === 0) {
    issues.push({
      type: 'seo',
      severity: 'high',
      location: '<body>',
      description: 'No H1 heading found on the page.',
      suggested_fix: 'Add exactly one H1 heading that describes the page content.',
      meta: {},
    })
  } else if (seo.h1.length > 1) {
    issues.push({
      type: 'seo',
      severity: 'medium',
      location: 'h1',
      description: `Multiple H1 headings found (${seo.h1.length}). Pages should have exactly one H1.`,
      suggested_fix: 'Consolidate to a single H1 heading.',
      meta: { h1s: seo.h1 },
    })
  }

  if (!seo.canonical) {
    issues.push({
      type: 'seo',
      severity: 'low',
      location: '<head>',
      description: 'No canonical tag found.',
      suggested_fix: 'Add <link rel="canonical" href="..."> to prevent duplicate content issues.',
      meta: {},
    })
  }

  for (const img of seo.imagesWithoutAlt) {
    issues.push({
      type: 'seo',
      severity: 'medium',
      location: img.selector,
      description: `Image missing alt text: ${img.src}`,
      suggested_fix: 'Add a descriptive alt attribute to all <img> elements.',
      meta: { src: img.src },
    })
  }

  // ── Link checker ──────────────────────────────────────────────────────────
  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href]')).map((a) => ({
      href: a.href,
      text: a.innerText.trim().slice(0, 80),
      selector: `a[href="${a.getAttribute('href')}"]`,
    }))
  )

  const checkedLinks = new Set()
  const linkChecks = []

  for (const link of links) {
    const href = link.href
    if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) continue
    if (checkedLinks.has(href)) continue
    checkedLinks.add(href)

    linkChecks.push(
      checkLink(href, LINK_TIMEOUT)
        .then((status) => {
          if (status >= 400 || status === 0) {
            issues.push({
              type: 'broken_link',
              severity: status === 404 ? 'high' : status >= 500 ? 'critical' : 'medium',
              location: link.selector,
              description: `Link returns HTTP ${status || 'ERR'}: ${href}`,
              suggested_fix: status === 404
                ? 'Update or remove the broken link.'
                : 'Check if the destination server is reachable.',
              meta: { href, status, linkText: link.text },
            })
          }
        })
        .catch(() => {
          issues.push({
            type: 'broken_link',
            severity: 'medium',
            location: link.selector,
            description: `Link failed to load (network error): ${href}`,
            suggested_fix: 'Verify the URL is reachable.',
            meta: { href, status: 0 },
          })
        })
    )
  }

  await Promise.allSettled(linkChecks)

  // ── Image checker ─────────────────────────────────────────────────────────
  const brokenImages = await page.evaluate(() =>
    Array.from(document.querySelectorAll('img')).reduce((acc, img) => {
      const broken =
        !img.src ||
        img.src === '' ||
        !img.complete ||
        (img.naturalWidth === 0 && img.naturalHeight === 0 && img.complete)
      if (broken) {
        acc.push({
          src: img.src || '(empty src)',
          selector: img.outerHTML.slice(0, 120),
        })
      }
      return acc
    }, [])
  )

  for (const img of brokenImages) {
    issues.push({
      type: 'missing_image',
      severity: 'high',
      location: img.selector,
      description: `Image failed to load: ${img.src}`,
      suggested_fix: 'Check that the image file exists at the referenced path.',
      meta: { src: img.src },
    })
  }

  // ── Console errors ─────────────────────────────────────────────────────────
  for (const err of consoleErrors) {
    issues.push({
      type: 'console_error',
      severity: 'medium',
      location: err.location ? `${err.location.url}:${err.location.lineNumber}` : 'unknown',
      description: err.text,
      suggested_fix: 'Investigate and resolve the JavaScript error.',
      meta: { stack: err.stack },
    })
  }

  // ── Failed network requests ────────────────────────────────────────────────
  for (const req of failedRequests) {
    // Skip known noise
    if (req.url.includes('analytics') || req.url.includes('gtag')) continue
    issues.push({
      type: 'console_error',
      severity: 'low',
      location: req.url,
      description: `Network request failed: ${req.method} ${req.url} — ${req.failure}`,
      suggested_fix: 'Verify the resource URL and server availability.',
      meta: req,
    })
  }

  await context.close()

  return { issues, seo, screenshotBuffer }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function checkLink(url, timeout) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; QAAuditor/1.0)' },
    })
    clearTimeout(timer)
    // If HEAD not supported, fall back to GET
    if (res.status === 405) {
      const res2 = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(timeout),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; QAAuditor/1.0)' },
      })
      return res2.status
    }
    return res.status
  } catch {
    clearTimeout(timer)
    return 0
  }
}
