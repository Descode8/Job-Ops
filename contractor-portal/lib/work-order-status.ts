export const WORK_ORDER_STATUS_COLORS = {
  not_started: '#9AA5B1',
  in_progress: '#55B8F3',
  completed: '#35A767',
} as const;

export const WORK_ORDER_STATUS_FONT = 'TrebuchetItalic';

export function workOrderStatusColor(status: string) {
  return WORK_ORDER_STATUS_COLORS[status as keyof typeof WORK_ORDER_STATUS_COLORS]
    ?? WORK_ORDER_STATUS_COLORS.not_started;
}
