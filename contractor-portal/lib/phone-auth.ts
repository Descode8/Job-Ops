export function normalizeUsPhone(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (national.length !== 10 || national.startsWith('0') || national.startsWith('1')) return null;
  return `+1${national}`;
}

export function normalizeOtp(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6);
}

export function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}
