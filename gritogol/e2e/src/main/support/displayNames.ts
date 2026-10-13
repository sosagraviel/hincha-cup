import { ScenarioContext } from '@support/ScenarioContext';
import { uniqueDisplayName } from '@data/factories';

/**
 * The Gherkin uses readable names ("QA Fan A"); the app gets a unique one per scenario ("QA Fan A k3x9q") so a
 * card can always be traced to this run. Steps translate the literal through the scenario context.
 */
const key = (literal: string) => `displayName:${literal}`;

export function assignDisplayName(ctx: ScenarioContext, literal: string): string {
  const actual = uniqueDisplayName(literal);
  ctx.set(key(literal), actual);
  return actual;
}

export function displayNameFor(ctx: ScenarioContext, literal: string): string {
  return ctx.get<string>(key(literal));
}
