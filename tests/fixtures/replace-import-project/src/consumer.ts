function formatName(first: string, last: string): string {
  return `${first} ${last}`;
}

export function greetUser(first: string, last: string): string {
  return `Hello, ${formatName(first, last)}!`;
}
