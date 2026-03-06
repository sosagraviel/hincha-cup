/**
 * Shared color palette used to give entities (orgs, projects) a consistent
 * deterministic color based on a string key. Each color pair has a background
 * class and a foreground text class.
 */
const ENTITY_COLORS = [
  { bg: 'bg-blue-50', text: 'text-blue-600' },
  { bg: 'bg-green-50', text: 'text-green-600' },
  { bg: 'bg-amber-50', text: 'text-amber-600' },
  { bg: 'bg-violet-50', text: 'text-violet-600' },
  { bg: 'bg-rose-50', text: 'text-rose-600' }
] as const;

/**
 * Returns a deterministic color pair for an entity based on its name/key.
 * Always returns the same color for the same input string.
 */
export function getEntityColor(key: string): { bg: string; text: string } {
  const idx =
    key.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) %
    ENTITY_COLORS.length;
  return ENTITY_COLORS[idx];
}
