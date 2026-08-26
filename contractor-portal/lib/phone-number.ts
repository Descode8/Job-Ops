export function phoneNumberDigits(value: string) {
  return value.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '').slice(0, 10);
}

export function formatPhoneNumber(value: string | null | undefined) {
  if (!value) return '';
  const digits = phoneNumberDigits(value);
  if (!digits) return value;
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
