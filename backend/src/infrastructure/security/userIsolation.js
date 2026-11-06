/**
 * @module infrastructure/security/userIsolation
 * @description Helper functions and assertions for enforcing single-user data isolation (NFR-SEC-004).
 * Ensures nonexistent and unauthorized resources return identical 404 NOT_FOUND envelopes.
 */

import { NotFoundError } from '../../shared/errors/AppError.js';

/**
 * Asserts that a resource exists and belongs to the specified user.
 * Returns the resource if valid; throws NotFoundError if missing or owned by another user.
 *
 * @template T
 * @param {T | null | undefined} resource
 * @param {string} userId - Authenticated user ID (string or ObjectId)
 * @param {string} [ownerField='userId'] - Field name representing the owner ('userId', 'user', 'ownerId')
 * @returns {T} Verified owned resource
 */
export const assertUserOwnership = (resource, userId, ownerField = 'userId') => {
  if (!resource) {
    throw new NotFoundError('The requested resource was not found.', 'NOT_FOUND');
  }

  const rawOwner = resource[ownerField] || resource.user || resource.userId;
  const ownerIdStr = rawOwner?._id ? rawOwner._id.toString() : rawOwner?.toString();
  const currentUserIdStr = userId?.toString();

  if (!ownerIdStr || ownerIdStr !== currentUserIdStr) {
    // Return identical 404 to avoid information disclosure / IDOR probing per NFR-SEC-004
    throw new NotFoundError('The requested resource was not found.', 'NOT_FOUND');
  }

  return resource;
};

/**
 * Builds an owner-scoped query object to guarantee tenant isolation in database queries.
 *
 * @param {string} userId - Authenticated user ID
 * @param {object} [additionalQuery={}] - Additional filter criteria
 * @param {string} [ownerField='userId'] - Owner field name
 * @returns {object} Filter query guaranteed to be scoped to the authenticated user
 */
export const buildOwnerQuery = (userId, additionalQuery = {}, ownerField = 'userId') => {
  if (!userId) {
    throw new Error('User ID is required to build an owner-scoped database query.');
  }
  return {
    ...additionalQuery,
    [ownerField]: userId,
  };
};

export default {
  assertUserOwnership,
  buildOwnerQuery,
};
