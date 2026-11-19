/**
 * @module utils/authUtils
 * @description Centralized, single-source utility functions for identity derivation and integration formatting.
 * Strictly adheres to Protocol 31 (single-source utility ownership) and Protocol 38 (deterministic name derivation).
 */

import { USER_NAME_LENGTH } from './constants.js';

/**
 * Formats a word by capitalizing its first character and lowercasing the remainder.
 *
 * @private
 * @function formatWord
 * @param {string} word - Raw word string.
 * @returns {string} Capitalized word.
 */
const formatWord = (word) => {
  if (!word) return '';
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
};

/**
 * Deterministically derives first and last names from an email address.
 * Strictly implements Protocol 38:
 * - Multi-segment local parts (split by [._\-+]) capitalize the first token as first name and second token as last name.
 * - Single-segment local parts capitalize the first character for first name and use the complete lowercased token as last name.
 *
 * @function deriveNamesFromEmail
 * @param {string} email - Valid email address.
 * @returns {{ firstName: string, lastName: string }} Derived first and last names.
 * @example
 * deriveNamesFromEmail('john.doe@example.com') // { firstName: 'John', lastName: 'Doe' }
 * deriveNamesFromEmail('alex@example.com')     // { firstName: 'Alex', lastName: 'alex' }
 */
export const deriveNamesFromEmail = (email) => {
  if (!email || typeof email !== 'string') {
    return { firstName: 'User', lastName: 'user' };
  }

  const localPart = email.split('@')[0] || '';
  const candidateParts = localPart
    .split(/[._\-+]+/)
    .filter(Boolean)
    .map((part) => part.replace(/[^a-zA-Z0-9]/g, ''))
    .filter((part) => part.length > 0);

  let firstName = '';
  let lastName = '';

  if (candidateParts.length >= 2) {
    firstName = formatWord(candidateParts[0]);
    lastName = formatWord(candidateParts[1]);
  } else if (candidateParts.length === 1) {
    firstName = formatWord(candidateParts[0]);
    lastName = candidateParts[0].toLowerCase();
  } else {
    firstName = 'User';
    lastName = 'user';
  }

  // Ensure names satisfy USER_NAME_LENGTH boundaries (min 2, max 50)
  if (firstName.length < USER_NAME_LENGTH.MIN) {
    firstName = `${firstName}_user`.slice(0, USER_NAME_LENGTH.MAX);
  }
  if (lastName.length < USER_NAME_LENGTH.MIN) {
    lastName = `${lastName}_user`.slice(0, USER_NAME_LENGTH.MAX);
  }

  if (firstName.length > USER_NAME_LENGTH.MAX) {
    firstName = firstName.slice(0, USER_NAME_LENGTH.MAX);
  }
  if (lastName.length > USER_NAME_LENGTH.MAX) {
    lastName = lastName.slice(0, USER_NAME_LENGTH.MAX);
  }

  return { firstName, lastName };
};

/**
 * Normalizes Telegram chat identifiers to canonical Telegram API standards.
 * Preserves public channel handles ('@channel_name'), prefixes 9+ digit positive channel IDs with '-100',
 * and preserves already normalized negative chat IDs.
 *
 * @function normalizeTelegramChatId
 * @param {string|number|null} chatId - Raw Telegram chat identifier.
 * @returns {string|null} Normalized Telegram chat ID or null.
 * @example
 * normalizeTelegramChatId('@ops_alerts')   // '@ops_alerts'
 * normalizeTelegramChatId(1234567890)      // '-1001234567890'
 * normalizeTelegramChatId('-100123456789') // '-100123456789'
 */
export const normalizeTelegramChatId = (chatId) => {
  if (chatId === null || chatId === undefined || chatId === '') {
    return null;
  }

  const trimmed = String(chatId).trim();
  if (!trimmed) {
    return null;
  }

  // Preserve public channel usernames (e.g. @alerts_channel)
  if (trimmed.startsWith('@')) {
    return trimmed;
  }

  // Preserve already normalized negative IDs (e.g. -1001234567890 or -987654321)
  if (trimmed.startsWith('-')) {
    return trimmed;
  }

  // If positive integer with 9+ digits, standard Telegram supergroup/channel prefix is -100
  if (/^\d{9,}$/.test(trimmed)) {
    return `-100${trimmed}`;
  }

  return trimmed;
};

export default {
  deriveNamesFromEmail,
  normalizeTelegramChatId,
};
