export const CACHED_ACCESS_MAX_AGE_MS =
  7 * 24 * 60 * 60 * 1000;

export function evaluateAccountAccess(
  record,
  {
    online = true,
    now = Date.now(),
    cachedAt = 0,
  } = {},
) {
  if (!record) {
    return {
      allowed: false,
      reason: 'account-missing',
    };
  }

  if (record.accountStatus === 'suspended') {
    return {
      allowed: false,
      reason: 'suspended',
    };
  }

  if (record.accountStatus === 'deactivated') {
    return {
      allowed: false,
      reason: 'deactivated',
    };
  }

  if (!online && now - cachedAt > CACHED_ACCESS_MAX_AGE_MS) {
    return {
      allowed: false,
      reason: 'reconnect-required',
    };
  }

  return {
    allowed: true,
    reason: 'allowed',
  };
}
