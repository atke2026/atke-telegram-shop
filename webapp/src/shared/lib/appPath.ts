/** Prefixes server-returned root-relative files with the current Vite mount. */
export function appPath(value: string): string {
  if (!value.startsWith('/')) return value;
  return `${import.meta.env.BASE_URL}${value.slice(1)}`;
}
