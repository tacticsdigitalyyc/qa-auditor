/**
 * AI Issue Explainer
 * Uses Claude API to enrich each issue with:
 * - Why it matters (SEO/UX impact)
 * - Step-by-step fix instructions
 * - Code example
 * - Estimated effort
 */

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-haiku-4-5-20251001' // fast + cheap for batch enrichment

/**
 * Enrich a batch of issues with AI explanations.
 * Groups similar issues to avoid redundant API calls.
 * Returns issues with added `explanation` field.
 */
export async function enrichIssues(issues) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[explainer] No ANTHROPIC_API_KEY set — skipping AI enrichment')
    return issues
  }

  // Deduplicate by type+severity to avoid calling API for 40 identical "missing image" issues
  const templates = buildTemplates(issues)

  // Enrich each unique template
  const enriched = new Map()
  for (const [key, sample] of templates) {
    try {
      const explanation = await explainIssue(sample)
      enriched.set(key, explanation)
    } catch (err) {
      console.error(`[explainer] Failed to enrich issue type ${key}:`, err.message)
    }
  }

  // Apply explanations back to all issues
  return issues.map(issue => {
    const key = templateKey(issue)
    const explanation = enriched.get(key)
    return explanation ? { ...issue, explanation } : issue
  })
}

/**
 * Build a map of unique issue templates (type+severity+subtype).
 * For broken links we use one template per status code.
 * For missing images we use one shared template.
 */
function buildTemplates(issues) {
  const templates = new Map()
  for (const issue of issues) {
    const key = templateKey(issue)
    if (!templates.has(key)) {
      templates.set(key, issue)
    }
  }
  return templates
}

function templateKey(issue) {
  if (issue.type === 'broken_link') {
    const status = issue.meta?.status || 0
    return `broken_link_${status}`
  }
  if (issue.type === 'missing_image') return 'missing_image'
  if (issue.type === 'seo') {
    // Each SEO issue type gets its own explanation
    const slug = issue.description.slice(0, 40).replace(/\s+/g, '_').toLowerCase()
    return `seo_${slug}`
  }
  if (issue.type === 'console_error') return 'console_error'
  return `${issue.type}_${issue.severity}`
}

/**
 * Call Claude API to generate a structured explanation for one issue.
 */
async function explainIssue(issue) {
  const prompt = buildPrompt(issue)

  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
      system: `You are a senior web developer writing issue explanations for a QA audit tool. 
Be concise, practical, and specific. 
Always respond with valid JSON only — no markdown, no preamble.
Target audience: developers and web agencies.`,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`API error ${res.status}: ${body}`)
  }

  const data = await res.json()
  const text = data.content?.[0]?.text || ''

  try {
    return JSON.parse(text)
  } catch {
    // Try to extract JSON from response if wrapped
    const match = text.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0])
    throw new Error('Failed to parse AI response as JSON')
  }
}

function buildPrompt(issue) {
  const context = {
    type: issue.type,
    severity: issue.severity,
    description: issue.description,
    location: issue.location,
    url: issue.meta?.href || issue.meta?.src || issue.url_target || '',
    statusCode: issue.meta?.status,
  }

  return `Generate a detailed explanation for this website QA issue.

Issue details:
${JSON.stringify(context, null, 2)}

Respond with this exact JSON structure:
{
  "impact": "1-2 sentences explaining why this matters for SEO, UX, or performance. Be specific about consequences.",
  "steps": ["Step 1: specific action", "Step 2: specific action", "Step 3: specific action"],
  "codeExample": "A short, relevant code snippet or command showing the fix. Use empty string if not applicable.",
  "effort": "quick | medium | complex",
  "effortNote": "One sentence explaining why (e.g. 'Requires updating 3 nav menu items in WordPress')"
}

Rules:
- impact: explain real-world consequences (ranking drop, users hitting dead ends, revenue loss)
- steps: max 4 steps, each starting with a verb, specific to the issue type
- codeExample: show the FIXED version, not the broken one. HTML, CSS, or CLI as appropriate. Empty string if no code applies.
- effort: "quick" = under 30 min, "medium" = 30 min to 2 hrs, "complex" = needs dev work
- Be specific to THIS issue, not generic advice`
}
