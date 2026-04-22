import type { InitializeProjectState } from '../../../../state/schemas/initialize-project.schema.js';
import { runCoreDocNode } from './run-core-doc.js';

export async function wikiDataflowsDocNode(
  state: InitializeProjectState,
): Promise<Partial<InitializeProjectState>> {
  return runCoreDocNode(state, 'data-flow', 'data_flows');
}
