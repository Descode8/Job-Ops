import assert from 'node:assert/strict';
import test from 'node:test';

import { formatCountdown, normalizeOtp, normalizeUsPhone } from '../lib/phone-auth.ts';

test('normalizes valid US phone numbers to E.164', () => {
  assert.equal(normalizeUsPhone('(864) 555-1234'), '+18645551234');
  assert.equal(normalizeUsPhone('+1 864 555 1234'), '+18645551234');
});

test('rejects invalid US phone numbers', () => {
  assert.equal(normalizeUsPhone('12345'), null);
  assert.equal(normalizeUsPhone('186455512345'), null);
  assert.equal(normalizeUsPhone('1645555123'), null);
});

test('normalizes OTP input and countdowns', () => {
  assert.equal(normalizeOtp('12 3a4567'), '123456');
  assert.equal(formatCountdown(61), '1:01');
});
