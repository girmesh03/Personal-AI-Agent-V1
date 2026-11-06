/**
 * @module modules/identity/utils/nameDerivation
 * @description Intelligently derives human-readable first and last names from an email address
 * when not explicitly provided by the user or identity provider.
 */

import { USER_NAME_LENGTH } from '../../../utils/constants.js';

/**
 * Derives first and last names from email address.
 *
 * @param {string} email - User email address
 * @returns {{ firstName: string, lastName: string }}
 */
export function deriveNamesFromEmail(email = '') {
  if (!email || typeof email !== 'string') {
    return { firstName: 'User', lastName: 'Member' };
  }

  const localPart = email.split('@')[0] || '';
  const rawParts = localPart.split(/[._\-+]+/).filter(Boolean);
  const alphaParts = rawParts.filter((p) => /[a-zA-Z]/.test(p));
  const candidateParts = alphaParts.length > 0 ? alphaParts : rawParts;

  const formatWord = (str) => {
    const clean = str.replace(/[^a-zA-Z]/g, '');
    const target = clean.length >= USER_NAME_LENGTH.MIN ? clean : str;
    const capped = target.charAt(0).toUpperCase() + target.slice(1).toLowerCase();
    return capped.slice(0, USER_NAME_LENGTH.MAX);
  };

  let first = 'User';
  let last = 'Member';

  if (candidateParts.length >= 2) {
    first = formatWord(candidateParts[0]);
    last = formatWord(candidateParts[1]);
  } else if (candidateParts.length === 1) {
    first = formatWord(candidateParts[0]);
    last = 'User';
  }

  if (first.length < USER_NAME_LENGTH.MIN) first = (first + '__').slice(0, USER_NAME_LENGTH.MAX);
  if (last.length < USER_NAME_LENGTH.MIN) last = (last + '__').slice(0, USER_NAME_LENGTH.MAX);

  return { firstName: first, lastName: last };
}
