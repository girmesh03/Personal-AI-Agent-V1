/**
 * @module utils/errorFormatter
 * @description Centralized error normalization and empathetic plain English translation.
 * Translates low-level SDK exceptions, upstream Google Gemini/Addis AI errors, and
 * database failures into actionable user guidance.
 */

/**
 * Normalizes any error object, string, or SDK exception into empathetic plain English.
 *
 * @param {Error|string|object} err - Error object, API error envelope, or raw error string
 * @returns {string} Empathetic plain English error description
 */
export function formatUserFriendlyError(err) {
  if (!err) return 'An unexpected error occurred. Please try again.';

  const rawMsg = String(err?.message || (typeof err === 'string' ? err : JSON.stringify(err)));
  const code = String(err?.code || err?.status || err?.errorCode || '');

  // 1. Google Gemini API Key Invalid or Missing
  if (
    rawMsg.includes('API_KEY_INVALID') ||
    rawMsg.includes('API key not valid') ||
    rawMsg.includes('invalid api key') ||
    rawMsg.includes('API_KEY_SERVICE_BLOCKED') ||
    rawMsg.includes('MISSING_GEMINI_KEY') ||
    code === 'MISSING_GEMINI_KEY'
  ) {
    return 'Your Google Gemini API key appears to be invalid or unconfigured. Please update your personal API key in Profile > AI Agent Settings.';
  }

  // 2. Addis AI API Key Invalid or Missing
  if (
    rawMsg.includes('ADDIS_API_KEY') ||
    rawMsg.includes('Addis AI key') ||
    rawMsg.includes('addisassistant.com')
  ) {
    return 'Your Addis AI key appears to be invalid or unconfigured. Please update your Addis AI key in Profile > AI Agent Settings.';
  }

  // 3. Permission Denied
  if (rawMsg.includes('PERMISSION_DENIED') || rawMsg.includes('permission denied')) {
    return 'Access was denied for your API credentials. Please check your project permissions in Google AI Studio.';
  }

  // 4. Quota Exhaustion / Rate Limiting (429)
  if (
    rawMsg.includes('429') ||
    rawMsg.includes('RESOURCE_EXHAUSTED') ||
    rawMsg.includes('quota') ||
    rawMsg.includes('rate limit') ||
    code === '429'
  ) {
    return 'All available AI models have temporarily reached their quota limit. Please switch to an alternative model or try again in a few moments.';
  }

  // 5. Network Timeout / Interruption
  if (
    rawMsg.includes('DEADLINE_EXCEEDED') ||
    rawMsg.includes('ETIMEDOUT') ||
    rawMsg.includes('timeout') ||
    rawMsg.includes('ECONNRESET') ||
    rawMsg.includes('socket hang up') ||
    rawMsg.includes('fetch failed')
  ) {
    return 'The connection was interrupted while communicating with the AI service. Please retry.';
  }

  // 6. Database Connectivity
  if (
    rawMsg.includes('MongoServerSelectionError') ||
    rawMsg.includes('getaddrinfo ENOTFOUND') ||
    rawMsg.includes('ECONNREFUSED')
  ) {
    return 'The database is temporarily unreachable. Please retry in a few moments.';
  }

  // 7. Safety / Content Filter
  if (rawMsg.includes('SAFETY') || rawMsg.includes('BLOCKED') || rawMsg.includes('HARM_CATEGORY')) {
    return 'The request or response was blocked by content safety filters. Please adjust your input and try again.';
  }

  // 8. Unsupported media / file types
  if (rawMsg.includes('UNSUPPORTED_MEDIA') || rawMsg.includes('unsupported file type')) {
    return 'The uploaded file format could not be processed. Please upload supported image, PDF, DOCX, TXT, or audio files.';
  }

  // 9. Generic clean fallback
  if (rawMsg.length > 120 || rawMsg.includes('at ') || rawMsg.includes('Error:')) {
    return 'An unexpected service error occurred while processing your request. Please try again.';
  }

  return rawMsg;
}

export default formatUserFriendlyError;
