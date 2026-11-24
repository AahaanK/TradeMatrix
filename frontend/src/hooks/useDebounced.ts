import { useEffect, useState } from "react"

/** Returns `value` after it has stopped changing for `delay` ms (used to avoid a request per slider tick). */
export function useDebounced<T>(value: T, delay = 400): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return v
}
