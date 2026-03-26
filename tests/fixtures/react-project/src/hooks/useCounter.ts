import { useState, useCallback } from 'react';

export function useCounter(initial: number) {
  const [count, setCount] = useState(initial);
  const increment = useCallback(() => setCount((c) => c + 1), []);
  return { count, increment };
}
