import { useEffect, useRef, useState } from 'react'

export function useMessageAnimation(messageCount: number) {
  const [animatingIndex, setAnimatingIndex] = useState<number | null>(null)
  const prevCountRef = useRef(messageCount)

  useEffect(() => {
    if (messageCount > prevCountRef.current) {
      setAnimatingIndex(messageCount - 1)
      const timeout = setTimeout(() => {
        setAnimatingIndex(null)
      }, 500)
      prevCountRef.current = messageCount
      return () => clearTimeout(timeout)
    }
    prevCountRef.current = messageCount
  }, [messageCount])

  return animatingIndex
}
