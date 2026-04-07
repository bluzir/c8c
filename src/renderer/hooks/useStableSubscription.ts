import { useEffect, useRef } from "react"

/**
 * Subscribes to an IPC event channel with a stable subscription that never
 * re-creates. The handler ref is updated every render so it always sees
 * fresh closure values, but the subscription itself runs once on mount.
 */
export function useStableSubscription<E>(
  subscribe: (handler: (event: E) => void) => () => void,
  handler: (event: E) => void,
): void {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    return subscribe((event) => handlerRef.current(event))
  }, [subscribe])
}
