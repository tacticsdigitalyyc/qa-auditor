import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { startScan } from '../lib/api.js'

export default function HomePage() {
  const [urlA, setUrlA] = useState('')
  const [urlB, setUrlB] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  const handleSubmit = async () => {
    setError(null)
    if (!urlA.trim()) return setError('URL A is required.')
    try { new URL(urlA) } catch { return setError('URL A is not a valid URL.') }
    if (urlB.trim()) {
      try { new URL(urlB) } catch { return setError('URL B is not a valid URL.') }
    }

    setLoading(true)
    try {
      const { scanId } = await startScan(urlA.trim(), urlB.trim() || null)
      navigate(`/scan/${scanId}`)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white mb-2">QA Auditor</h1>
          <p className="text-gray-400">Automated website QA — broken links, images, SEO, console errors.</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
              URL A <span className="text-red-400">*</span>
            </label>
            <input
              type="url"
              placeholder="https://example.com"
              value={urlA}
              onChange={(e) => setUrlA(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
              URL B <span className="text-gray-600">(optional — for A/B comparison)</span>
            </label>
            <input
              type="url"
              placeholder="https://staging.example.com"
              value={urlB}
              onChange={(e) => setUrlB(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-900/20 border border-red-900/40 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold py-2.5 rounded-lg transition-colors"
          >
            {loading ? 'Starting scan...' : 'Run QA Scan'}
          </button>
        </div>

        <p className="text-center text-gray-600 text-xs mt-4">
          Scans typically take 15–60 seconds depending on page size.
        </p>
      </div>
    </div>
  )
}
