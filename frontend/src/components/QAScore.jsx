export default function QAScore({ score, prev, size = 'md' }) {
  if (score === null || score === undefined) return null

  const color =
    score >= 80 ? 'text-green-400' :
    score >= 60 ? 'text-amber-400' :
    score >= 40 ? 'text-orange-400' :
    'text-red-400'

  const ring =
    score >= 80 ? 'border-green-500' :
    score >= 60 ? 'border-amber-500' :
    score >= 40 ? 'border-orange-500' :
    'border-red-500'

  const delta = prev !== null && prev !== undefined ? score - prev : null

  return (
    <div className={`flex items-center gap-2`}>
      <div className={`rounded-full border-2 ${ring} flex items-center justify-center ${size === 'lg' ? 'w-16 h-16' : 'w-10 h-10'}`}>
        <span className={`font-bold ${color} ${size === 'lg' ? 'text-2xl' : 'text-sm'}`}>{score}</span>
      </div>
      {delta !== null && (
        <span className={`text-xs font-medium ${delta > 0 ? 'text-green-400' : delta < 0 ? 'text-red-400' : 'text-gray-500'}`}>
          {delta > 0 ? `+${delta}` : delta}
        </span>
      )}
    </div>
  )
}
