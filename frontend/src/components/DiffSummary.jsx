export default function DiffSummary({ diff }) {
  if (!diff) return null
  const { new: newCount, resolved, regressed, unchanged } = diff

  return (
    <div className="flex flex-wrap gap-2 text-xs">
      {newCount > 0 && (
        <span className="bg-red-900/40 text-red-400 border border-red-900/60 px-2 py-0.5 rounded-full font-medium">
          +{newCount} new
        </span>
      )}
      {resolved > 0 && (
        <span className="bg-green-900/40 text-green-400 border border-green-900/60 px-2 py-0.5 rounded-full font-medium">
          {resolved} fixed
        </span>
      )}
      {regressed > 0 && (
        <span className="bg-orange-900/40 text-orange-400 border border-orange-900/60 px-2 py-0.5 rounded-full font-medium">
          {regressed} regressed
        </span>
      )}
      {newCount === 0 && resolved === 0 && regressed === 0 && (
        <span className="bg-gray-800 text-gray-400 border border-gray-700 px-2 py-0.5 rounded-full">
          no changes
        </span>
      )}
    </div>
  )
}
