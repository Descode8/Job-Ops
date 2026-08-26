const DAY_IN_MS = 86_400_000;

export function formatWorkOrderDeadline(deadline: string | null, now = new Date()) {
  if (!deadline) return 'No Deadline';

  const deadlineDate = new Date(deadline);
  if (!Number.isFinite(deadlineDate.getTime())) return 'No Deadline';

  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDate = Date.UTC(deadlineDate.getFullYear(), deadlineDate.getMonth(), deadlineDate.getDate());
  const daysRemaining = Math.round((dueDate - today) / DAY_IN_MS);

  if (daysRemaining === 0) return 'Due Today';
  if (daysRemaining === 1) return '1 Day Until Deadline';
  if (daysRemaining > 1) return `${daysRemaining} Days Until Deadline`;
  if (daysRemaining === -1) return '1 Day Overdue';
  return `${Math.abs(daysRemaining)} Days Overdue`;
}
