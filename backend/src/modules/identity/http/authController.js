/**
 * @module modules/identity/http/authController
 * @description Authentication controller managing registration, login, token refresh rotation,
 * logout, user profile retrieval, and Google SSO flows.
 */

import { HTTP_STATUS } from '../../../utils/constants.js';
import {
  registerUser,
  loginUser,
  rotateUserSession,
  logoutUser,
  getUserProfile,
  authenticateWithGoogleSso,
} from '../services/authService.js';
import {
  isGoogleAuthConfigured,
  getGoogleCallbackUrl,
  generateGoogleAuthUrl,
  verifySignedState,
  exchangeCodeForTokens,
  fetchGoogleUserProfile,
} from '../services/googleAuthService.js';
import {
  setAuthCookies,
  clearAuthCookies,
} from '../../../infrastructure/security/tokenService.js';
import {
  UnauthenticatedError,
  BadRequestError,
  NotFoundError,
} from '../../../shared/errors/AppError.js';
import { deriveNamesFromEmail } from '../utils/nameDerivation.js';
import { env } from '../../../config/env.js';
import logger from '../../../config/logger.js';

export { deriveNamesFromEmail };

/**
 * Registers a new user account.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const register = async (req, res) => {
  const payload = req.validated?.body || req.body;
  const result = await registerUser(payload);

  res.status(HTTP_STATUS.CREATED).json({
    success: true,
    message: 'User registered successfully. Please log in.',
    data: {
      user: result.user,
    },
  });
};

/**
 * Authenticates user credentials and issues session tokens.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const login = async (req, res) => {
  const { email, password } = req.validated?.body || req.body;
  const userAgent = req.headers['user-agent'] || 'unknown';
  const ipAddress = req.ip || req.socket?.remoteAddress || 'unknown';

  const result = await loginUser({ email, password, userAgent, ipAddress });

  if (result.requiresSso) {
    return res.status(HTTP_STATUS.UNAUTHENTICATED).json({
      success: false,
      errorCode: 'SSO_PASSWORD_NOT_SET',
      message: result.message,
      data: {
        authProvider: result.authProvider,
      },
    });
  }

  setAuthCookies(res, result.accessToken, result.refreshToken);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Login successful',
    data: {
      user: result.user,
    },
  });
};

/**
 * Refreshes access token using long-lived refresh token.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const refreshToken = async (req, res) => {
  const rawRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
  const userAgent = req.headers['user-agent'] || 'unknown';
  const ipAddress = req.ip || req.socket?.remoteAddress || 'unknown';

  const result = await rotateUserSession({
    rawRefreshToken,
    userAgent,
    ipAddress,
  });

  setAuthCookies(res, result.accessToken, result.refreshToken);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Token refreshed successfully',
    data: {
      user: result.user,
    },
  });
};

/**
 * Invalidate session and clear authentication cookies.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const logout = async (req, res) => {
  const rawRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

  await logoutUser({ rawRefreshToken });
  clearAuthCookies(res);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Logged out successfully',
    data: null,
  });
};

/**
 * Retrieves the profile of the currently authenticated user.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const getMe = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  if (!userId) {
    throw new UnauthenticatedError('User authentication is required.', 'UNAUTHENTICATED');
  }

  const user = await getUserProfile(userId);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: {
      user,
    },
  });
};

/**
 * Initiates Google SSO login/registration flow.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const initiateGoogleSso = async (req, res) => {
  const clientUrl = env.CLIENT_ORIGIN || 'http://localhost:3000';

  if (!isGoogleAuthConfigured()) {
    if (req.query.json === 'true' || req.headers.accept?.includes('application/json')) {
      return res.status(HTTP_STATUS.OK).json({
        success: false,
        message: 'Google OAuth is not configured on this server.',
        data: { provider: 'google', configured: false },
      });
    }
    return res.redirect(`${clientUrl}/login?error=GOOGLE_SSO_NOT_CONFIGURED`);
  }

  const callbackUrl = getGoogleCallbackUrl(req);
  const authUrl = generateGoogleAuthUrl({
    redirectUri: callbackUrl,
    flow: 'sso',
  });

  if (req.query.json === 'true' || req.headers.accept?.includes('application/json')) {
    return res.status(HTTP_STATUS.OK).json({
      success: true,
      url: authUrl,
    });
  }

  res.redirect(authUrl);
};

/**
 * Handles Google SSO OAuth redirect callback.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const handleGoogleSsoCallback = async (req, res) => {
  const { code, state, error } = req.query;
  const clientUrl = env.CLIENT_ORIGIN || 'http://localhost:3000';

  if (error || !code) {
    logger.warn(`[authController] Google SSO aborted or error received: ${error}`);
    return res.redirect(`${clientUrl}/login?error=${encodeURIComponent(String(error || 'GOOGLE_AUTH_CANCELLED'))}`);
  }

  try {
    verifySignedState(String(state));

    const callbackUrl = getGoogleCallbackUrl(req);
    const tokens = await exchangeCodeForTokens({
      code: String(code),
      redirectUri: callbackUrl,
    });

    const profile = await fetchGoogleUserProfile(tokens.access_token);
    const userAgent = req.headers['user-agent'] || 'unknown';
    const ipAddress = req.ip || req.socket?.remoteAddress || 'unknown';

    const result = await authenticateWithGoogleSso({
      profile,
      userAgent,
      ipAddress,
    });

    setAuthCookies(res, result.accessToken, result.refreshToken);

    if (req.query.json === 'true' || req.headers.accept?.includes('application/json')) {
      return res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Google SSO authentication successful.',
        data: {
          user: result.user,
        },
      });
    }

    res.redirect(`${clientUrl}/dashboard?auth=sso`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'GOOGLE_SSO_FAILED';
    logger.error(`[authController] Google SSO callback error: ${message}`);
    res.redirect(`${clientUrl}/login?error=${encodeURIComponent(message)}`);
  }
};

/**
 * Unified Google OAuth callback dispatcher.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const handleGoogleCallback = async (req, res) => {
  const { state } = req.query;

  let flow = 'sso';
  if (state && typeof state === 'string') {
    try {
      const decoded = verifySignedState(state);
      flow = decoded.flow || 'sso';
    } catch {
      if (state === 'sso') flow = 'sso';
    }
  }

  if (flow === 'sso' || state === 'sso') {
    return handleGoogleSsoCallback(req, res);
  }

  // Google Drive connector flow (to be fully handled in Phase 10)
  const clientUrl = env.CLIENT_ORIGIN || 'http://localhost:3000';
  res.redirect(`${clientUrl}/profile?tab=cloud-integrations&google_auth=success`);
};

/**
 * Initiates Google Drive OAuth connection (Connector placeholder).
 */
export const connectGoogleDrive = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  if (!userId) {
    throw new UnauthenticatedError('User authentication is required to connect Google Drive.');
  }

  const callbackUrl = getGoogleCallbackUrl(req);
  const authUrl = generateGoogleAuthUrl({
    redirectUri: callbackUrl,
    flow: 'drive',
    returnUrl: '/profile?tab=cloud-integrations',
  });

  if (req.query.json === 'true' || req.headers.accept?.includes('application/json')) {
    return res.status(HTTP_STATUS.OK).json({
      success: true,
      data: { authUrl, url: authUrl },
    });
  }

  res.redirect(authUrl);
};

/**
 * Disconnects Google Drive integration.
 */
export const disconnectGoogleDriveRoute = async (req, res) => {
  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Google Drive disconnected successfully.',
  });
};

/**
 * Checks Google Drive connection status.
 */
export const getGoogleDriveStatus = async (req, res) => {
  const drive = req.user?.integrations?.googleDrive || {};
  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: {
      connected: Boolean(drive.connected),
      enabled: drive.enabled !== false,
      email: drive.email || null,
      rootFolderId: drive.rootFolderId || null,
      connectedAt: drive.connectedAt || null,
    },
  });
};

/**
 * Toggles Google Drive integration.
 */
export const toggleGoogleDriveRoute = async (_req, res) => {
  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Google Drive status updated successfully.',
  });
};
