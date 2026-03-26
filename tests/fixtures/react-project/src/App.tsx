import React from 'react';
import { Header } from '@components/Header';
import { useCounter } from '@/hooks/useCounter';

export function App() {
  const { count, increment } = useCounter(0);
  return (
    <div>
      <Header title="My App" />
      <p>Count: {count}</p>
      <button onClick={increment}>+</button>
    </div>
  );
}
