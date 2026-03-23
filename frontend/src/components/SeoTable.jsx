export default function SeoTable({ seoA, seoB }) {
  const fields = [
    { key: 'title', label: 'Title' },
    { key: 'description', label: 'Meta description' },
    { key: 'canonical', label: 'Canonical' },
  ]

  const h1A = seoA?.h1?.join(', ') || '—'
  const h1B = seoB?.h1?.join(', ') || null

  const isDiff = (a, b) => b !== null && a !== b

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wide">
            <th className="text-left px-3 py-2 w-32">Field</th>
            <th className="text-left px-3 py-2">URL A</th>
            {seoB && <th className="text-left px-3 py-2">URL B</th>}
          </tr>
        </thead>
        <tbody>
          {fields.map(({ key, label }) => {
            const valA = seoA?.[key] || '—'
            const valB = seoB?.[key] || null
            const diff = isDiff(valA, valB)
            return (
              <tr key={key} className={`border-b border-gray-800/50 ${diff ? 'bg-amber-900/10' : ''}`}>
                <td className="px-3 py-2 text-gray-500 font-medium whitespace-nowrap">{label}</td>
                <td className="px-3 py-2 text-gray-300 break-words max-w-xs">{valA}</td>
                {seoB && (
                  <td className={`px-3 py-2 break-words max-w-xs ${diff ? 'text-amber-400' : 'text-gray-300'}`}>
                    {valB || '—'}
                    {diff && <span className="ml-2 text-xs bg-amber-900 text-amber-300 px-1 rounded">diff</span>}
                  </td>
                )}
              </tr>
            )
          })}
          {/* H1 row */}
          <tr className={`border-b border-gray-800/50 ${isDiff(h1A, h1B) ? 'bg-amber-900/10' : ''}`}>
            <td className="px-3 py-2 text-gray-500 font-medium">H1</td>
            <td className="px-3 py-2 text-gray-300">{h1A}</td>
            {seoB && (
              <td className={`px-3 py-2 ${isDiff(h1A, h1B) ? 'text-amber-400' : 'text-gray-300'}`}>
                {h1B || '—'}
                {isDiff(h1A, h1B) && <span className="ml-2 text-xs bg-amber-900 text-amber-300 px-1 rounded">diff</span>}
              </td>
            )}
          </tr>
          {/* Images without alt */}
          <tr>
            <td className="px-3 py-2 text-gray-500 font-medium whitespace-nowrap">Images missing alt</td>
            <td className="px-3 py-2 text-gray-300">{seoA?.imagesWithoutAlt?.length ?? '—'} / {seoA?.totalImages ?? '—'}</td>
            {seoB && <td className="px-3 py-2 text-gray-300">{seoB?.imagesWithoutAlt?.length ?? '—'} / {seoB?.totalImages ?? '—'}</td>}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
