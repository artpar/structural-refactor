import React from 'react';

interface HeaderProps {
  title: string;
}

export function Header({ title }: HeaderProps) {
  return <h1>{title}</h1>;
}
