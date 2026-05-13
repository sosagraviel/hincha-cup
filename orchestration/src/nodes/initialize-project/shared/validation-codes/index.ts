/**
 * Public entry point for the validation-codes subsystem. Stop-hook callsites
 * import `formatValidationError` (compressed one-liner) for retry feedback
 * and `formatValidationErrorLong` for debug rendering.
 */

export {
  VALIDATION_CODES,
  NEEDS_VERIFICATION_SUBCODE_TO_KEY,
  formatValidationError,
  formatValidationErrorLong,
} from './codes.js';
export type { ValidationCodeKey, ValidationCodeSpec } from './codes.js';
