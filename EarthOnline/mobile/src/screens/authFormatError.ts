import type { TFunction } from 'i18next';

export function formatAuthError(e: unknown, t: TFunction): string {
  if (e && typeof e === 'object' && 'message' in e) {
    const msg = String((e as { message: string }).message);
    const lower = msg.toLowerCase();
    if (
      lower.includes('email not confirmed') ||
      lower.includes('email_not_confirmed') ||
      lower.includes('not confirmed')
    ) {
      return t('auth.emailNotConfirmed');
    }
    if (
      lower.includes('invalid login credentials') ||
      lower.includes('invalid_grant') ||
      msg === 'Invalid login credentials'
    ) {
      return t('auth.invalidCreds');
    }
    return msg;
  }
  return t('common.retryLater');
}
