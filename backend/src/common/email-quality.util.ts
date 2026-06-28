export type EmailAssessment = {
  suspicious: boolean;
  reasons: string[];
};

const BASIC_EMAIL =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  'guerrillamail.net',
  'guerrillamail.org',
  'grr.la',
  'sharklasers.com',
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net',
  'tempmail.com',
  'temp-mail.org',
  'temp-mail.io',
  '10minutemail.com',
  '10minutemail.net',
  'minutemail.com',
  'throwaway.email',
  'getnada.com',
  'trashmail.com',
  'trashmail.me',
  'fakeinbox.com',
  'dispostable.com',
  'maildrop.cc',
  'mailnesia.com',
  'moakt.com',
  'emailondeck.com',
  'mintemail.com',
  'mytemp.email',
  'tempail.com',
  'spamgourmet.com',
  'mailcatch.com',
  'getairmail.com',
  'inboxkitten.com',
  'mailsac.com',
  'discard.email',
  'mailpoof.com',
  'fakemail.net',
  'tempinbox.com',
  'burnermail.io',
]);

const FAKE_DOMAINS = new Set([
  'example.com',
  'example.org',
  'example.net',
  'test.com',
  'test.test',
  'localhost',
  'invalid',
  'fake.com',
  'notreal.com',
]);

const SUSPICIOUS_LOCAL_TOKENS = new Set([
  'test',
  'fake',
  'spam',
  'trash',
  'temp',
  'throwaway',
  'noreply',
  'no-reply',
  'asdf',
  'qwerty',
  'admin',
  'root',
  'null',
  'undefined',
  'none',
  'abc123',
]);

function localPart(email: string): string {
  return email.split('@')[0] ?? '';
}

function domainPart(email: string): string {
  return email.split('@')[1]?.toLowerCase() ?? '';
}

function looksLikeGibberishLocal(local: string): boolean {
  const stripped = local.replace(/[.+_-]/g, '');
  if (stripped.length < 10) return false;

  const vowels = (stripped.match(/[aeiou]/gi) ?? []).length;
  if (stripped.length >= 12 && vowels / stripped.length < 0.12) {
    return true;
  }

  if (/^[a-f0-9]{20,}$/i.test(stripped)) return true;
  if (/^[a-z0-9]{18,}$/i.test(stripped) && vowels === 0) return true;
  if (/(.)\1{4,}/.test(stripped)) return true;

  const keyboardRuns = ['qwerty', 'asdfgh', 'zxcvbn', '123456', 'abcdef'];
  const lower = stripped.toLowerCase();
  return keyboardRuns.some((run) => lower.includes(run));
}

export function assessEmail(email: string | null | undefined): EmailAssessment {
  const reasons: string[] = [];

  if (!email?.trim()) {
    return { suspicious: true, reasons: ['missing_email'] };
  }

  const normalized = email.trim().toLowerCase();

  if (!BASIC_EMAIL.test(normalized)) {
    reasons.push('invalid_format');
    return { suspicious: true, reasons };
  }

  const local = localPart(normalized);
  const domain = domainPart(normalized);

  if (!domain || !domain.includes('.')) {
    reasons.push('invalid_domain');
  }

  const tld = domain.split('.').pop() ?? '';
  if (tld.length < 2 || /^\d+$/.test(tld)) {
    reasons.push('invalid_tld');
  }

  if (DISPOSABLE_DOMAINS.has(domain)) {
    reasons.push('disposable_domain');
  }

  if (FAKE_DOMAINS.has(domain)) {
    reasons.push('fake_domain');
  }

  const baseLocal = local.split('+')[0] ?? local;
  if (SUSPICIOUS_LOCAL_TOKENS.has(baseLocal)) {
    reasons.push('suspicious_local_part');
  }

  if (looksLikeGibberishLocal(baseLocal)) {
    reasons.push('gibberish_local_part');
  }

  if (baseLocal.length > 40) {
    reasons.push('unusually_long_local_part');
  }

  if (/^[^a-z0-9]+$/i.test(baseLocal)) {
    reasons.push('nonsense_local_part');
  }

  const domainLabel = domain.split('.')[0] ?? '';
  if (domainLabel.length <= 2 && domain.split('.').length === 2) {
    reasons.push('minimal_domain');
  }

  return { suspicious: reasons.length > 0, reasons };
}

export function isRegistrationEmailAllowed(email: string): boolean {
  const assessment = assessEmail(email);
  if (!assessment.suspicious) return true;

  const hardBlock = new Set([
    'missing_email',
    'invalid_format',
    'invalid_domain',
    'invalid_tld',
    'disposable_domain',
    'fake_domain',
  ]);

  return !assessment.reasons.some((reason) => hardBlock.has(reason));
}

export const REGISTRATION_EMAIL_REJECTED_MESSAGE =
  'That email address does not look valid. Use a real inbox you can access.';
