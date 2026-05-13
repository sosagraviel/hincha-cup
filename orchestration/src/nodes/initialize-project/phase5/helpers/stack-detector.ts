/**
 * Stack Detector
 *
 * Extract detected technologies from stack profile
 */

import type { StackProfile } from '../../../../schemas/index.js';
import type { DetectedStack } from '../types.js';

/**
 * Extract detected technologies from stack profile
 * Returns both normalized (for exact matching) and original (for delimiter-based prefix matching)
 */
export function extractDetectedStack(stackProfile: StackProfile): DetectedStack {
  const normalized = new Set<string>();
  const original = new Set<string>();

  if (stackProfile.services && Array.isArray(stackProfile.services)) {
    stackProfile.services.forEach((service) => {
      const lang = service.language.toLowerCase();
      normalized.add(lang);
      original.add(lang);

      if (service.frameworks) {
        if (service.frameworks.main) {
          normalized.add(service.frameworks.main.toLowerCase().replace(/[^a-z0-9]/g, ''));
          original.add(service.frameworks.main.toLowerCase());
        }
        if (service.frameworks.ui) {
          normalized.add(service.frameworks.ui.toLowerCase().replace(/[^a-z0-9]/g, ''));
          original.add(service.frameworks.ui.toLowerCase());
        }
        if (service.frameworks.orm) {
          normalized.add(service.frameworks.orm.toLowerCase().replace(/[^a-z0-9]/g, ''));
          original.add(service.frameworks.orm.toLowerCase());
        }
        if (service.frameworks.testing) {
          normalized.add(service.frameworks.testing.toLowerCase().replace(/[^a-z0-9]/g, ''));
          original.add(service.frameworks.testing.toLowerCase());
        }
        if (service.frameworks.additional) {
          service.frameworks.additional.forEach((f) => {
            normalized.add(f.toLowerCase().replace(/[^a-z0-9]/g, ''));
            original.add(f.toLowerCase());
          });
        }
      }

      if (service.testing) {
        if (service.testing.unit?.framework) {
          normalized.add(service.testing.unit.framework.toLowerCase().replace(/[^a-z0-9]/g, ''));
          original.add(service.testing.unit.framework.toLowerCase());
        }
        if (service.testing.integration?.framework) {
          normalized.add(
            service.testing.integration.framework.toLowerCase().replace(/[^a-z0-9]/g, ''),
          );
          original.add(service.testing.integration.framework.toLowerCase());
        }
        if (service.testing.e2e?.framework) {
          normalized.add(service.testing.e2e.framework.toLowerCase().replace(/[^a-z0-9]/g, ''));
          original.add(service.testing.e2e.framework.toLowerCase());
        }
      }
    });
  }

  if (stackProfile.infrastructure) {
    stackProfile.infrastructure.forEach((infra) => {
      const lower = infra.toLowerCase();
      normalized.add(lower.replace(/[^a-z0-9]/g, ''));
      original.add(lower);
    });
  }

  return { normalized, original };
}
