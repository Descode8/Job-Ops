export function formatWorkOrderNumber(workOrderNumber: string | null | undefined) {
  if (!workOrderNumber) return 'Work order';
  return workOrderNumber.startsWith('WO# ') ? workOrderNumber : `#${workOrderNumber}`;
}
