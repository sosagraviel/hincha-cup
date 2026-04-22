import type { InitializeProjectState } from '../../../../state/schemas/initialize-project.schema.js';
import { runCoreDocNode } from './run-core-doc.js';

export async function wikiArchitectureDocNode(
  state: InitializeProjectState,
): Promise<Partial<InitializeProjectState>> {
  return runCoreDocNode(state, 'architecture', 'architecture');
}
