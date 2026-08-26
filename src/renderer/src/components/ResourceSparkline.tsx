import { useEffect, useRef, useState } from 'react'
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts'
import { cn } from '@renderer/lib/utils'

const HISTORY_LENGTH = 30

interface ResourceSparklineProps {
  value: number
  color: 'primary' | 'secondary'
  className?: string
}

export function ResourceSparkline({ value, color, className }: ResourceSparklineProps): JSX.Element {
  const [history, setHistory] = useState<{ v: number }[]>(() => Array(HISTORY_LENGTH).fill({ v: 0 }))
  const lastValue = useRef(value)

  useEffect(() => {
    lastValue.current = value
    setHistory((h) => {
      const next = [...h.slice(1), { v: value }]
      return next
    })
  }, [value])

  const strokeColor = color === 'primary' ? 'hsl(258 90% 66%)' : 'hsl(199 89% 58%)'
  const gradientId = `spark-${color}`

  return (
    <div className={cn('h-10 w-24', className)}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={history} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity={0.5} />
              <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis domain={[0, 'auto']} hide />
          <Area
            type="monotone"
            dataKey="v"
            stroke={strokeColor}
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
