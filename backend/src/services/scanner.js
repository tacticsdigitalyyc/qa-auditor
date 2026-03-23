import { getBrowser } from '../utils/browser.js'

const PAGE_TIMEOUT = 20000
const LINK_TIMEOUT = 12000

// How many links to check concurrently
const LINK_CONCURRENCY = 5

export async function scanUrl(url) {
  const browser = await getBrowser()
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ignoreHTTPSErrors: true,
  })
  const page = await context.newPage()

  const issues = []
  const consoleErrors = []
  const failedRequests = []

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push({ text: msg.text(), location: msg.location() })
    }
  })

  page.on('pageerror', (err) => {
    consoleErrors.push({ text: err.message, stack: err.stack })
  })

  page.on('requestfailed', (req) => {
    failedRequests.push({
      url: req.url(),
      method: req.method(),
      failure: req.failure()?.errorText,
    })
  })

  // ── Navigate ────────────────────────────────────────────────────────────────
  let navStatus = 200
  try {
    const res = await page.goto(url, { waitUntil: 'networkidle', timeout: PAGE_TIMEOUT })
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

  // ── Screenshot ──────────────────────────────────────────────────────────────
  const screenshotBuffer = await page.screenshot({ fullPage: true }).catch(() => null)

  // ── SEO extraction ──────────────────────────────────────────────────────────
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
    const imagesWithoutAlt = images
      .filter((img) => !img.getAttribute('alt'))
      .map((img) => ({ src: img.src, selector: img.outerHTML.slice(0, 120) }))

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

  // ── SEO issues ───────────────────────────────────────────────────────────────
  if (!seo.title) {
    issues.push({
      type: 'seo', severity: 'high', location: '<head>',
      description: 'Missing <title> tag.',
      suggested_fix: 'Add a descriptive <title> tag to the <head> of the page.',
      meta: {},
    })
  } else if (seo.title.length < 30 || seo.title.length > 60) {
    issues.push({
      type: 'seo', severity: 'medium', location: '<title>',
      description: `Title length is ${seo.title.length} characters (ideal: 30–60).`,
      suggested_fix: 'Adjust title length to between 30 and 60 characters.',
      meta: { title: seo.title },
    })
  }

  if (!seo.description) {
    issues.push({
      type: 'seo', severity: 'high', location: '<head>',
      description: 'Missing meta description.',
      suggested_fix: 'Add a <meta name="description"> tag with 120–160 characters.',
      meta: {},
    })
  } else if (seo.description.length < 120 || seo.description.length > 160) {
    issues.push({
      type: 'seo', severity: 'low', location: 'meta[name="description"]',
      description: `Meta description is ${seo.description.length} characters (ideal: 120–160).`,
      suggested_fix: 'Adjust meta description to between 120 and 160 characters.',
      meta: { description: seo.description },
    })
  }

  if (!seo.h1 || seo.h1.length === 0) {
    issues.push({
      type: 'seo', severity: 'high', location: '<body>',
      description: 'No H1 heading found on the page.',
      suggested_fix: 'Add exactly one H1 heading that describes the page content.',
      meta: {},
    })
  } else if (seo.h1.length > 1) {
    issues.push({
      type: 'seo', severity: 'medium', location: 'h1',
      description: `Multiple H1 headings found (${seo.h1.length}). Pages should have exactly one H1.`,
      suggested_fix: 'Consolidate to a single H1 heading.',
      meta: { h1s: seo.h1 },
    })
  }

  if (!seo.canonical) {
    issues.push({
      type: 'seo', severity: 'low', location: '<head>',
      description: 'No canonical tag found.',
      suggested_fix: 'Add <link rel="canonical" href="..."> to prevent duplicate content issues.',
      meta: {},
    })
  }

  for (const img of seo.imagesWithoutAlt) {
    issues.push({
      type: 'seo', severity: 'medium', location: img.selector,
      description: `Image missing alt text: ${img.src}`,
      suggested_fix: 'Add a descriptive alt attribute to all <img> elements.',
      meta: { src: img.src },
    })
  }

  // ── Link checker (using real browser, avoids false positives) ───────────────
  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href]')).map((a) => ({
      href: a.href,
      text: a.innerText.trim().slice(0, 80),
      selector: `a[href="${a.getAttribute('href')}"]`,
    }))
  )

  const checkedLinks = new Set()
  const linkQueue = []

  for (const link of links) {
    const href = link.href
    if (
      !href ||
      href.startsWith('mailto:') ||
      href.startsWith('tel:') ||
      href.startsWith('javascript:') ||
      href.startsWith('#') ||
      href === url ||
      href === url + '/'
    ) continue
    if (checkedLinks.has(href)) continue
    checkedLinks.add(href)
    linkQueue.push({ href, selector: link.selector, text: link.text })
  }

  // Process links in batches to avoid opening too many browser contexts
  for (let i = 0; i < linkQueue.length; i += LINK_CONCURRENCY) {
    const batch = linkQueue.slice(i, i + LINK_CONCURRENCY)
    await Promise.allSettled(
      batch.map(async ({ href, selector, text }) => {
        const status = await checkLinkWithBrowser(href, LINK_TIMEOUT)
        // Only flag genuine 4xx/5xx — treat 0 (network err) as skipped to avoid false positives
        if (status >= 400) {
          issues.push({
            type: 'broken_link',
            severity: status === 404 ? 'high' : status >= 500 ? 'critical' : 'medium',
            location: selector,
            description: `Link returns HTTP ${status}: ${href}`,
            suggested_fix: status === 404
              ? 'Update or remove the broken link.'
              : 'Check if the destination server is reachable.',
            meta: { href, status, linkText: text },
          })
        }
        // status 0 = network/connection error — skip, not reported as broken
      })
    )
  }

  // ── Image checker ────────────────────────────────────────────────────────────
  const brokenImages = await page.evaluate(() =>
    Array.from(document.querySelectorAll('img')).reduce((acc, img) => {
      const broken =
        !img.src ||
        img.src === '' ||
        !img.complete ||
        (img.naturalWidth === 0 && img.naturalHeight === 0 && img.complete)
      if (broken) acc.push({ src: img.src || '(empty src)', selector: img.outerHTML.slice(0, 120) })
      return acc
    }, [])
  )

  for (const img of brokenImages) {
    issues.push({
      type: 'missing_image', severity: 'high', location: img.selector,
      description: `Image failed to load: ${img.src}`,
      suggested_fix: 'Check that the image file exists at the referenced path.',
      meta: { src: img.src },
    })
  }

  // ── Console errors ───────────────────────────────────────────────────────────
  for (const err of consoleErrors) {
    issues.push({
      type: 'console_error', severity: 'medium',
      location: err.location ? `${err.location.url}:${err.location.lineNumber}` : 'unknown',
      description: err.text,
      suggested_fix: 'Investigate and resolve the JavaScript error.',
      meta: { stack: err.stack },
    })
  }

  // ── Failed network requests (skip common noise) ───────────────────────────
  const NOISE = ['analytics', 'gtag', 'googletagmanager', 'hotjar', 'intercom', 'facebook.net', 'doubleclick']
  for (const req of failedRequests) {
    if (NOISE.some((n) => req.url.includes(n))) continue
    issues.push({
      type: 'console_error', severity: 'low', location: req.url,
      description: `Network request failed: ${req.method} ${req.url} — ${req.failure}`,
      suggested_fix: 'Verify the resource URL and server availability.',
      meta: req,
    })
  }

  await context.close()
  return { issues, seo, screenshotBuffer }
}

// ── Use real Playwright browser to check link status ─────────────────────────
// This avoids false positives from sites that block programmatic fetch/HEAD requests
async function checkLinkWithBrowser(url, timeout) {
  const browser = await getBrowser()
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ignoreHTTPSErrors: true,
  })
  const page = await context.newPage()
  let status = 0
  try {
    const response = await page.goto(url, {
      waitUntil: 'commit', // just get HTTP response headers, don't wait for full page load
      timeout,
    })
    status = response?.status() ?? 0
  } catch {
    status = 0 // connection error — treated as skipped, not broken
  } finally {
    await context.close()
  }
  return status
}
