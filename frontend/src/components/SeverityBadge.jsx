const colors = {
  critical: 'bg-red-900 text-red-400',
  high: 'bg-orange-900 text-orange-400',
  medium: 'bg-amber-900 text-amber-400',
  low: 'bg-gray-800 text-gray-400',
}

export default function SeverityBadge({ severity }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide ${colors[severity] || colors.low}`}>
      {severity}
    </span>
  )
}
