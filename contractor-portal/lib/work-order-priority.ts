const PRIORITY_RANK: Record<string, number> = {
  emergency: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const PRIORITY_COLORS: Record<string, string> = {
  emergency: '#DC2626',
  high: '#F97316',
  medium: '#FFB020',
  low: '#8B97A5',
};

export function workOrderPriorityColor(priority: string, colorScheme: 'light' | 'dark' = 'dark') {
  if (priority.toLowerCase() === 'medium' && colorScheme === 'light') return '#B8860B';
  return PRIORITY_COLORS[priority.toLowerCase()] ?? PRIORITY_COLORS.low;
}

export function compareWorkOrderPriority(a: { priority: string }, b: { priority: string }) {
  return (PRIORITY_RANK[a.priority] ?? 4) - (PRIORITY_RANK[b.priority] ?? 4);
}
