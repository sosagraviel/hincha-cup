/**
 * Plan v4 Phase F — `detectInputUnavailableStub` unit tests.
 *
 * Asserts:
 *   - Five framework-emitted apology phrases are caught.
 *   - Empty / whitespace bodies pass (nothing to reject).
 *   - Stack-specific stubs ("no Laravel routes detected") are NOT
 *     caught — they may be legitimate analyzer findings.
 */

import { describe, expect, it } from 'vitest';
import { detectInputUnavailableStub } from '../../../../../src/nodes/initialize-project/phase3/validators/detect-input-unavailable-stub.js';

describe('detectInputUnavailableStub', () => {
  it.each([
    'Insufficient data to complete this section.',
    'Insufficient information available.',
    'Data is unavailable for this project.',
    'Data not available — skipping.',
    'Information missing for this section.',
    'Unable to determine the testing strategy.',
    'Unable to complete this section due to missing data.',
    'Could not determine the framework conventions.',
    'Could not extract enough patterns to render this section.',
  ])('rejects framework-emitted apology phrase: %s', (phrase) => {
    expect(detectInputUnavailableStub(phrase)).not.toBeNull();
  });

  it('passes on empty / whitespace input', () => {
    expect(detectInputUnavailableStub('')).toBeNull();
    expect(detectInputUnavailableStub('   \n  ')).toBeNull();
  });

  it('passes on legitimate prose without apology phrases', () => {
    const body =
      'The api service uses NestJS controllers with class-validator DTOs. Each route registers a guard.';
    expect(detectInputUnavailableStub(body)).toBeNull();
  });

  it('does NOT reject stack-specific findings — those are analyzer-emitted facts', () => {
    expect(detectInputUnavailableStub('No Laravel routes detected.')).toBeNull();
    expect(detectInputUnavailableStub('No automated tests in this service.')).toBeNull();
    expect(detectInputUnavailableStub('No Cargo.toml found in this workspace.')).toBeNull();
  });

  it('produces a feedback message naming the apology phrase + the fix', () => {
    const msg = detectInputUnavailableStub('Insufficient data here.') ?? '';
    expect(msg).toContain('INPUT-UNAVAILABLE STUB DETECTED');
    expect(msg).toContain('Insufficient data');
    expect(msg).toContain('SKIP the H2 entirely');
  });
});
