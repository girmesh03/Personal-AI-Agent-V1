/**
 * @module validations/userValidation
 * @description Zod 4 validation schemas and TypeScript/JSDoc inferred type definitions
 * for user profile, directives, integrations, and unified agent configuration endpoints.
 * Strictly adheres to Protocol 18 (unified validation), Protocol 37 (canonical directives naming),
 * Protocol 39 (strict validation hygiene), Protocol 70 (consolidated BYOK apiKeys), and Protocol 71 (strong type contracts).
 */

import { z } from 'zod';
import {
  USER_NAME_LENGTH,
  PASSWORD_REGEX,
  EMAIL_REGEX,
  CHAT_CONSTANTS,
  REPORT_CONSTANTS,
  TELEGRAM_CONSTANTS,
  MODEL_PROVIDER_MAP,
  AI_PROVIDERS,
} from '../utils/constants.js';

/**
 * @typedef {import('zod').infer<typeof updateProfileSchema>} UpdateProfileInput
 */

/**
 * Validation schema for updating user profile metadata.
 * @constant
 * @type {import('zod').ZodObject<any>}
 */
export const updateProfileSchema = z
  .object({
    firstName: z
      .string()
      .trim()
      .min(USER_NAME_LENGTH.MIN, `First name must be at least ${USER_NAME_LENGTH.MIN} characters.`)
      .max(USER_NAME_LENGTH.MAX, `First name cannot exceed ${USER_NAME_LENGTH.MAX} characters.`)
      .optional(),
    lastName: z
      .string()
      .trim()
      .min(USER_NAME_LENGTH.MIN, `Last name must be at least ${USER_NAME_LENGTH.MIN} characters.`)
      .max(USER_NAME_LENGTH.MAX, `Last name cannot exceed ${USER_NAME_LENGTH.MAX} characters.`)
      .optional(),
    email: z.string().trim().regex(EMAIL_REGEX, 'Please provide a valid email address.').optional(),
    position: z.string().trim().max(100, 'Position cannot exceed 100 characters.').optional(),
  })
  .strict({
    message: 'Profile update contains unauthorized fields.',
  });

/**
 * @typedef {import('zod').infer<typeof updateAvatarSchema>} UpdateAvatarInput
 */

/**
 * Validation schema for updating user avatar asset.
 * @constant
 * @type {import('zod').ZodObject<any>}
 */
export const updateAvatarSchema = z
  .object({
    avatar: z.string().min(1, 'Avatar image URL or data is required.'),
    avatarPublicId: z.string().trim().nullable().optional(),
  })
  .strict();

/**
 * @typedef {import('zod').infer<typeof updatePasswordSchema>} UpdatePasswordInput
 */

/**
 * Validation schema for changing account password.
 * @constant
 * @type {import('zod').ZodEffects<any>}
 */
export const updatePasswordSchema = z
  .object({
    currentPassword: z.string().optional(),
    newPassword: z
      .string({ required_error: 'New password is required.' })
      .regex(
        PASSWORD_REGEX,
        'New password must contain at least 8 characters, including 1 uppercase, 1 lowercase, 1 number, and 1 special character.'
      ),
    confirmNewPassword: z
      .string({ required_error: 'Please confirm your new password.' })
      .min(1, 'Please confirm your new password.'),
  })
  .strict()
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: 'New password and confirmation password do not match.',
    path: ['confirmNewPassword'],
  });

/**
 * @typedef {import('zod').infer<typeof updateAgentConfigSchema>} UpdateAgentConfigInput
 */

/**
 * Validation schema for updating AI agent configuration with unified BYOK credentials (Protocol 63, 70).
 * @constant
 * @type {import('zod').ZodEffects<any>}
 */
export const updateAgentConfigSchema = z
  .object({
    persona: z.string().trim().max(2000, 'Persona cannot exceed 2000 characters.').optional(),
    defaultProvider: z.enum(CHAT_CONSTANTS.SUPPORTED_PROVIDERS).optional(),
    defaultModel: z.enum(CHAT_CONSTANTS.SUPPORTED_MODELS).optional(),
    defaultThinkingBudget: z
      .number()
      .int()
      .min(CHAT_CONSTANTS.MIN_THINKING_BUDGET)
      .max(CHAT_CONSTANTS.MAX_THINKING_BUDGET)
      .optional(),
    defaultLanguage: z.enum(CHAT_CONSTANTS.SUPPORTED_LANGUAGES).optional(),
    sttEngine: z.enum(CHAT_CONSTANTS.STT_ENGINES).optional(),
    tts: z
      .object({
        amharicVoice: z.string().trim().optional(),
        englishVoice: z.string().trim().optional(),
        speed: z.number().min(0.5).max(2.0).optional(),
        autoPlay: z.boolean().optional(),
      })
      .strict()
      .optional(),
    reportTemplates: z
      .object({
        singleBranch: z
          .string()
          .trim()
          .max(REPORT_CONSTANTS.TEMPLATE_MAX_LENGTH)
          .nullable()
          .optional(),
        multiBranch: z
          .string()
          .trim()
          .max(REPORT_CONSTANTS.TEMPLATE_MAX_LENGTH)
          .nullable()
          .optional(),
      })
      .strict()
      .optional(),
    apiKeys: z
      .object({
        geminiApiKey: z.string().trim().nullable().optional(),
        addisApiKey: z.string().trim().nullable().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (data) => {
      if (data.defaultProvider && data.defaultModel) {
        return MODEL_PROVIDER_MAP[data.defaultModel] === data.defaultProvider;
      }
      return true;
    },
    {
      message: 'Selected defaultModel does not belong to the selected defaultProvider.',
      path: ['defaultModel'],
    }
  )
  .refine(
    (data) => {
      if (data.defaultProvider === AI_PROVIDERS.ADDIS && data.defaultThinkingBudget && data.defaultThinkingBudget > 0) {
        return false;
      }
      return true;
    },
    {
      message: 'Thinking budget must be 0 for Addis AI as it does not support reasoning tokens.',
      path: ['defaultThinkingBudget'],
    }
  );

/**
 * @typedef {import('zod').infer<typeof updateDirectivesSchema>} UpdateDirectivesInput
 */

/**
 * Validation schema for updating user directives.
 * Strictly enforces Protocol 37 naming: userInstructions, negativeVocabulary, phraseMappings.
 * @constant
 * @type {import('zod').ZodObject<any>}
 */
export const updateDirectivesSchema = z
  .object({
    negativeVocabulary: z.array(z.string().trim()).optional(),
    phraseMappings: z.record(z.string(), z.string()).optional(),
    userInstructions: z
      .union([z.array(z.string().trim()), z.string().trim()])
      .transform((val) => (Array.isArray(val) ? val : [val]))
      .optional(),
  })
  .strict({
    message: 'Directives payload contains invalid properties. Use userInstructions, negativeVocabulary, phraseMappings only.',
  });

/**
 * @typedef {import('zod').infer<typeof verifyTelegramSchema>} VerifyTelegramInput
 */

/**
 * Validation schema for verifying Telegram bot token format.
 * @constant
 * @type {import('zod').ZodObject<any>}
 */
export const verifyTelegramSchema = z
  .object({
    botToken: z.string({ required_error: 'Bot token is required.' }).trim().min(1, 'Bot token cannot be empty.'),
  })
  .strict();

/**
 * @typedef {import('zod').infer<typeof connectTelegramSchema>} ConnectTelegramInput
 */

/**
 * Validation schema for connecting Telegram integration.
 * @constant
 * @type {import('zod').ZodObject<any>}
 */
export const connectTelegramSchema = z
  .object({
    botToken: z.string().trim().optional(),
    botUsername: z.string().trim().nullable().optional(),
    managementChatId: z.union([z.string(), z.number()]).nullable().optional(),
    maintenanceChatId: z.union([z.string(), z.number()]).nullable().optional(),
    generalChatId: z.union([z.string(), z.number()]).nullable().optional(),
    defaultFormat: z.enum(TELEGRAM_CONSTANTS.FORMATS).optional(),
    imageCardOptions: z.record(z.any()).optional(),
  })
  .strict();

/**
 * @typedef {import('zod').infer<typeof verifyCloudinarySchema>} VerifyCloudinaryInput
 */

/**
 * Validation schema for verifying Cloudinary API credentials (Protocol 66).
 * @constant
 * @type {import('zod').ZodObject<any>}
 */
export const verifyCloudinarySchema = z
  .object({
    cloudName: z.string({ required_error: 'Cloud name is required.' }).trim().min(1, 'Cloud name cannot be empty.'),
    apiKey: z.string({ required_error: 'API key is required.' }).trim().min(1, 'API key cannot be empty.'),
    apiSecret: z.string({ required_error: 'API secret is required.' }).trim().min(1, 'API secret cannot be empty.'),
  })
  .strict();

/**
 * @typedef {import('zod').infer<typeof connectCloudinarySchema>} ConnectCloudinaryInput
 */

/**
 * Validation schema for connecting Cloudinary integration credentials (Protocol 66).
 * @constant
 * @type {import('zod').ZodObject<any>}
 */
export const connectCloudinarySchema = z
  .object({
    cloudName: z.string({ required_error: 'Cloud name is required.' }).trim().min(1, 'Cloud name cannot be empty.'),
    apiKey: z.string({ required_error: 'API key is required.' }).trim().min(1, 'API key cannot be empty.'),
    apiSecret: z.string({ required_error: 'API secret is required.' }).trim().min(1, 'API secret cannot be empty.'),
  })
  .strict();

/**
 * @typedef {import('zod').infer<typeof toggleIntegrationSchema>} ToggleIntegrationInput
 */

/**
 * Unified validation schema for toggling integration active status (Protocol 66).
 * Replaces fragmented service-specific toggle schemas.
 * @constant
 * @type {import('zod').ZodObject<any>}
 */
export const toggleIntegrationSchema = z
  .object({
    enabled: z.boolean({ required_error: 'Enabled status is required.' }),
  })
  .strict();

/**
 * @typedef {import('zod').infer<typeof deleteAccountSchema>} DeleteAccountInput
 */

/**
 * Validation schema for three-tier account deletion.
 * @constant
 * @type {import('zod').ZodObject<any>}
 */
export const deleteAccountSchema = z
  .object({
    password: z.string().optional(),
  })
  .strict();

export default {
  updateProfileSchema,
  updateAvatarSchema,
  updatePasswordSchema,
  updateAgentConfigSchema,
  updateDirectivesSchema,
  verifyTelegramSchema,
  connectTelegramSchema,
  verifyCloudinarySchema,
  connectCloudinarySchema,
  toggleIntegrationSchema,
  deleteAccountSchema,
};
