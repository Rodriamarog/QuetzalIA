import { useState, useEffect } from 'react'

interface LoadingDotsProps { 
  isSearching?: boolean
}

export function LoadingDots({ isSearching = true }: LoadingDotsProps) {// ⚠️
  const [message, setMessage] = useState('Pensando')

  useEffect(() => {
    if (!isSearching) return

    const timer = setTimeout(() => {
      setMessage('Buscando tesis relevantes')
    }, 1000)

    return () => clearTimeout(timer)
  }, [isSearching])

  return (
    <div className="flex gap-3">
      <div className="bg-muted rounded-lg p-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{message}</span>
          <span className="flex gap-1">
            <span className="animate-bounce-dot animation-delay-0">.</span>
            <span className="animate-bounce-dot animation-delay-200">.</span>
            <span className="animate-bounce-dot animation-delay-400">.</span>
          </span>
        </div>
      </div>
    </div>
  )
}
