import { z } from 'zod';
import { readFileSync } from 'fs';

// Try with z.any() instead of z.unknown()
const AnalyzerOutputSchema = z.object({
  agent_name: z.enum([
    'structure-architecture-analyzer',
    'tech-stack-dependencies-analyzer',
    'code-patterns-testing-analyzer',
    'data-flows-integrations-analyzer'
  ]),
  timestamp: z.string(),
  findings: z.object({}).passthrough(),  // Use passthrough instead of z.record()
  needs_verification: z.array(z.string()).max(3).optional(),
  confidence_level: z.enum(['high', 'medium', 'low']).optional()
});

// Load the actual JSON that failed
const rawJSON = readFileSync('/Users/ignaciobarreto/itIsHere/projects/gira/.claude-temp/initialize-project/phase1-outputs/structure-architecture-analyzer-attempt1.raw', 'utf-8');

console.log('=== Testing Zod Validation with Real JSON ===\n');
console.log('Raw JSON length:', rawJSON.length);
console.log('Schema defined:', !!AnalyzerOutputSchema);
console.log('Schema type:', typeof AnalyzerOutputSchema);

try {
  // Parse the JSON
  const data = JSON.parse(rawJSON);
  console.log('\n✅ JSON.parse() succeeded');
  console.log('Parsed data keys:', Object.keys(data));
  console.log('agent_name:', data.agent_name);
  console.log('timestamp:', data.timestamp);
  console.log('has findings:', !!data.findings);
  console.log('has needs_verification:', !!data.needs_verification);

  // Now test Zod validation
  console.log('\n--- Testing safeParse() ---');
  const result = AnalyzerOutputSchema.safeParse(data);

  console.log('safeParse completed');
  console.log('Result has success property:', 'success' in result);
  console.log('Success value:', result.success);

  if (result.success) {
    console.log('\n✅ ZOD VALIDATION PASSED!');
    console.log('Valid data keys:', Object.keys(result.data));
  } else {
    console.log('\n❌ Zod validation FAILED');
    console.log('Error object:', result.error);
    console.log('Error has .errors:', 'errors' in result.error);
    if ('errors' in result.error) {
      console.log('Error count:', result.error.errors.length);
      console.log('Errors:', JSON.stringify(result.error.errors, null, 2));
    }
  }
} catch (error) {
  console.error('\n❌ EXCEPTION:');
  console.error('Type:', error?.constructor?.name);
  console.error('Message:', (error as Error)?.message);
  console.error('Stack:', (error as Error)?.stack);
}
