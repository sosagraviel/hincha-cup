/**
 * Public surface of the portable-paths architecture. Importers should use this
 * module — the underlying files are implementation details.
 */
export type { AbsolutePath, ProjectRelativePath } from './types.js';
export { PortabilityError, asAbsolutePath, asProjectRelativePath } from './types.js';
export { PortablePathResolver } from './path-resolver.service.js';
export { PortableWriter } from './portable-writer.service.js';
