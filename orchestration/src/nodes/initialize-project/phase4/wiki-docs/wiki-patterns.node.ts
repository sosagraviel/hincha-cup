import type { InitializeProjectState } from '../../../../state/schemas/initialize-project.schema.js';
import { runCoreDocNode } from './run-core-doc.js';

export async function wikiPatternsDocNode(
  state: InitializeProjectState,
): Promise<Partial<InitializeProjectState>> {
  return runCoreDocNode(state, 'pattern', 'patterns');
}
