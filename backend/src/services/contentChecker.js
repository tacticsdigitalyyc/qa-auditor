/**
 * Content Quality + Security Checker
 * Handles: duplicate content, uniqueness scoring, phishing/scam link detection
 */

import { createHash } from 'crypto'

// ── Known malicious domain patterns (static blocklist for auto-scan) ──────────
const MALICIOUS_PATTERNS = [
  /bit\.ly\/[a-z0-9]+$/i,
  /tinyurl\.com/i,
  /\.tk$/i, /\.ml$/i, /\.ga$/i, /\.cf$/i, /\.gq$/i,
  /[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/,
  /paypa1\.com/i, /arnazon\.com/i, /g00gle\.com/i,
  /secure.*login.*\.com/i, /account.*verify.*\.com/i,
  /banking.*secure.*\.net/i,
]

// Suspicious TLDs commonly used in phishing
const SUSPICIOUS_TLDS = ['.tk', '.ml', '.ga', '.cf', '.gq', '.xyz', '.top', '.click', '.link']

// ── AUTO-SCAN CHECKS ──────────────────────────────────────────────────────────

/**
 * Run all auto-scan content + security checks on a loaded Playwright page.
 * Returns array of issues.
 */
export async function runAutoChecks(page, url) {
  const issues = []

  const [
    duplicateIssues,
    anchorDeceptionIssues,
    staticMaliciousIssues,
    iframeIssues,
    thinContentIssues,
  ] = await Promise.all([
    checkDuplicateContent(page, url),
    checkAnchorDeception(page, url),
    checkStaticMaliciousDomains(page, url),
    checkSuspiciousIframes(page, url),
    checkThinContent(page, url),
  ])

  issues.push(
    ...duplicateIssues,
    ...anchorDeceptionIssues,
    ...staticMaliciousIssues,
    ...iframeIssues,
    ...thinContentIssues,
  )

  return issues
}

/**
 * Check for duplicate content blocks within the same page.
 */
async function checkDuplicateContent(page, url) {
  const issues = []

  const data = await page.evaluate(() => {
    // Extract text blocks from meaningful elements
    const blocks = Array.from(
      document.querySelectorAll('p, h1, h2, h3, h4, li, td, blockquote')
    )
      .map(el => ({
        text: el.innerText?.trim() || '',
        tag: el.tagName.toLowerCase(),
        selector: el.tagName.toLowerCase() + (el.className ? '.' + el.className.split(' ')[0] : ''),
      }))
      .filter(b => b.text.length > 80) // only meaningful blocks

    // Check meta duplication
    const title = document.title || ''
    const desc = document.querySelector('meta[name="description"]')?.getAttribute('content') || ''
    const h1s = Array.from(document.querySelectorAll('h1')).map(h => h.innerText?.trim())

    return { blocks, title, desc, h1s }
  })

  // Find duplicate text blocks
  const seen = new Map()
  for (const block of data.blocks) {
    const hash = createHash('md5').update(block.text.toLowerCase()).digest('hex')
    if (seen.has(hash)) {
      issues.push({
        type: 'duplicate_content',
        severity: 'medium',
        location: block.selector,
        description: `Duplicate content block found: "${block.text.slice(0, 80)}..."`,
        suggested_fix: 'Remove or rewrite duplicate content. Each section should have unique text.',
        meta: { duplicateOf: seen.get(hash), text: block.text.slice(0, 120) },
      })
    } else {
      seen.set(hash, block.selector)
    }
  }

  // Check if title matches H1 exactly (duplicate signal)
  if (data.title && data.h1s.length > 0) {
    const titleClean = data.title.toLowerCase().trim()
    for (const h1 of data.h1s) {
      if (h1.toLowerCase().trim() === titleClean) {
        issues.push({
          type: 'duplicate_content',
          severity: 'low',
          location: 'h1, title',
          description: `Page title and H1 are identical: "${data.title}". This is a minor SEO issue.`,
          suggested_fix: 'Differentiate your H1 from your page title. H1 can be more conversational while the title is more keyword-focused.',
          meta: { title: data.title, h1: h1 },
        })
      }
    }
  }

  // Check thin content
  return issues
}

/**
 * Check for thin content (low word count).
 */
async function checkThinContent(page, url) {
  const issues = []

  const wordCount = await page.evaluate(() => {
    const body = document.body?.innerText || ''
    return body.trim().split(/\s+/).filter(w => w.length > 0).length
  })

  if (wordCount < 300) {
    issues.push({
      type: 'content_quality',
      severity: 'high',
      location: 'body',
      description: `Thin content detected: page has only ${wordCount} words. Google considers pages under 300 words as low-quality.`,
      suggested_fix: 'Add substantive content to reach at least 600-800 words. Focus on answering user intent thoroughly.',
      meta: { wordCount },
    })
  } else if (wordCount < 600) {
    issues.push({
      type: 'content_quality',
      severity: 'medium',
      location: 'body',
      description: `Low content volume: ${wordCount} words. Pages with 600+ words tend to rank better.`,
      suggested_fix: 'Expand content to at least 600 words. Add FAQs, examples, or elaboration on key points.',
      meta: { wordCount },
    })
  }

  return issues
}

/**
 * Check for anchor text deception — link text doesn't match destination domain.
 */
async function checkAnchorDeception(page, pageUrl) {
  const issues = []
  const pageDomain = new URL(pageUrl).hostname.replace('www.', '')

  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href]')).map(a => ({
      href: a.href,
      text: a.innerText?.trim() || '',
      selector: `a[href="${a.getAttribute('href')}"]`,
    }))
  )

  const TRUSTED_BRANDS = [
    'google', 'facebook', 'paypal', 'apple', 'microsoft', 'amazon',
    'netflix', 'instagram', 'twitter', 'linkedin', 'youtube', 'stripe',
    'shopify', 'wordpress', 'github',
  ]

  for (const link of links) {
    if (!link.href || !link.text || link.text.length < 3) continue
    try {
      const linkDomain = new URL(link.href).hostname.replace('www.', '')
      if (linkDomain === pageDomain) continue // internal links OK

      // Check if anchor text mentions a trusted brand but links elsewhere
      const textLower = link.text.toLowerCase()
      for (const brand of TRUSTED_BRANDS) {
        if (textLower.includes(brand) && !linkDomain.includes(brand)) {
          issues.push({
            type: 'security',
            severity: 'critical',
            location: link.selector,
            description: `Deceptive link: text says "${link.text}" but links to ${linkDomain} — possible phishing injection.`,
            suggested_fix: 'Remove or correct this link immediately. This pattern is used by hackers to redirect users to malicious sites.',
            meta: { href: link.href, text: link.text, linkDomain },
          })
          break
        }
      }
    } catch { continue }
  }

  return issues
}

/**
 * Check outbound links against static malicious patterns.
 */
async function checkStaticMaliciousDomains(page, pageUrl) {
  const issues = []
  const pageDomain = new URL(pageUrl).hostname

  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href]')).map(a => ({
      href: a.href,
      text: a.innerText?.trim() || '',
      selector: `a[href="${a.getAttribute('href')}"]`,
    }))
  )

  for (const link of links) {
    if (!link.href || link.href.startsWith('mailto:') || link.href.startsWith('tel:')) continue

    try {
      const linkUrl = new URL(link.href)
      const linkDomain = linkUrl.hostname

      if (linkDomain === pageDomain) continue

      // Check suspicious TLDs
      const tld = '.' + linkDomain.split('.').pop()
      if (SUSPICIOUS_TLDS.includes(tld)) {
        issues.push({
          type: 'security',
          severity: 'high',
          location: link.selector,
          description: `Suspicious TLD detected: link to ${linkDomain} uses a high-risk domain extension (${tld}) commonly used in phishing.`,
          suggested_fix: 'Verify this link is intentional. If you did not add this link, your site may have been compromised.',
          meta: { href: link.href, linkDomain, tld },
        })
        continue
      }

      // Check against malicious patterns
      for (const pattern of MALICIOUS_PATTERNS) {
        if (pattern.test(link.href)) {
          issues.push({
            type: 'security',
            severity: 'high',
            location: link.selector,
            description: `Potentially malicious link pattern detected: ${link.href}`,
            suggested_fix: 'Investigate this link immediately. If you did not add it, your site may contain injected malicious content.',
            meta: { href: link.href, pattern: pattern.toString() },
          })
          break
        }
      }
    } catch { continue }
  }

  return issues
}

/**
 * Check for suspicious iframes loading external content.
 */
async function checkSuspiciousIframes(page, pageUrl) {
  const issues = []
  const pageDomain = new URL(pageUrl).hostname.replace('www.', '')

  const iframes = await page.evaluate(() =>
    Array.from(document.querySelectorAll('iframe')).map(f => ({
      src: f.src || f.getAttribute('src') || '',
      width: f.width,
      height: f.height,
      hidden: f.style.display === 'none' || f.style.visibility === 'hidden' ||
              parseInt(f.width) < 5 || parseInt(f.height) < 5,
      selector: `iframe[src="${f.getAttribute('src')}"]`,
    }))
  )

  const TRUSTED_IFRAME_SOURCES = [
    'youtube.com', 'youtu.be', 'vimeo.com', 'google.com', 'maps.google.com',
    'googletagmanager.com', 'facebook.com', 'twitter.com', 'linkedin.com',
    'stripe.com', 'paypal.com', 'calendly.com', 'typeform.com', 'loom.com',
  ]

  for (const iframe of iframes) {
    if (!iframe.src) continue

    try {
      const iframeDomain = new URL(iframe.src).hostname.replace('www.', '')
      if (iframeDomain === pageDomain) continue

      const trusted = TRUSTED_IFRAME_SOURCES.some(t => iframeDomain.includes(t))

      // Hidden iframes are always suspicious
      if (iframe.hidden) {
        issues.push({
          type: 'security',
          severity: 'critical',
          location: iframe.selector,
          description: `Hidden iframe detected loading: ${iframe.src} — this is a common technique used by hackers to load malicious content invisibly.`,
          suggested_fix: 'Remove this iframe immediately if you did not add it. Audit your site files and database for injected code.',
          meta: { src: iframe.src, hidden: true },
        })
        continue
      }

      // Untrusted external iframes
      if (!trusted) {
        issues.push({
          type: 'security',
          severity: 'medium',
          location: iframe.selector,
          description: `Unrecognised external iframe loading content from: ${iframeDomain}`,
          suggested_fix: 'Verify this iframe is intentional and the source is trustworthy. Unknown iframes can be a sign of a compromised site.',
          meta: { src: iframe.src, iframeDomain },
        })
      }
    } catch { continue }
  }

  return issues
}

// ── DEEP SCAN CHECKS ──────────────────────────────────────────────────────────

/**
 * Deep scan: check all outbound links against Google Safe Browsing API.
 * Requires GOOGLE_SAFE_BROWSING_API_KEY env var.
 */
export async function checkGoogleSafeBrowsing(urls) {
  const apiKey = process.env.GOOGLE_SAFE_BROWSING_API_KEY
  if (!apiKey) {
    console.warn('[security] No GOOGLE_SAFE_BROWSING_API_KEY — skipping Safe Browsing check')
    return []
  }

  const issues = []
  const BATCH_SIZE = 500 // Google API limit

  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const batch = urls.slice(i, i + BATCH_SIZE)

    try {
      const res = await fetch(
        `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client: { clientId: 'lintry', clientVersion: '1.0' },
            threatInfo: {
              threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
              platformTypes: ['ANY_PLATFORM'],
              threatEntryTypes: ['URL'],
              threatEntries: batch.map(url => ({ url })),
            },
          }),
        }
      )

      const data = await res.json()
      if (data.matches) {
        for (const match of data.matches) {
          issues.push({
            type: 'security',
            severity: 'critical',
            location: `a[href="${match.threat.url}"]`,
            description: `Google Safe Browsing flagged this URL as ${match.threatType}: ${match.threat.url}`,
            suggested_fix: 'Remove this link immediately. The destination has been flagged by Google as malicious. If you did not add this link, your site has been compromised — change all passwords and scan server files.',
            meta: { url: match.threat.url, threatType: match.threatType, platformType: match.platformType },
          })
        }
      }
    } catch (err) {
      console.error('[security] Safe Browsing API error:', err.message)
    }
  }

  return issues
}

/**
 * Deep scan: compute content uniqueness score using TF-IDF similarity.
 * Compares current page text against provided comparison texts.
 */
export function computeUniquenessScore(pageText, comparisonTexts) {
  if (!comparisonTexts || comparisonTexts.length === 0) return 100

  const tokenize = text =>
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3)

  const pageTokens = tokenize(pageText)
  const pageSet = new Set(pageTokens)

  let maxSimilarity = 0

  for (const compText of comparisonTexts) {
    const compTokens = tokenize(compText)
    const compSet = new Set(compTokens)

    // Jaccard similarity
    const intersection = new Set([...pageSet].filter(t => compSet.has(t)))
    const union = new Set([...pageSet, ...compSet])
    const similarity = union.size > 0 ? intersection.size / union.size : 0
    maxSimilarity = Math.max(maxSimilarity, similarity)
  }

  return Math.round((1 - maxSimilarity) * 100)
}
