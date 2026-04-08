/**
 * Template Renderer
 *
 * Render Handlebars templates with provided variables
 */

import Handlebars from "handlebars";

/**
 * Render template with variables using Handlebars (matching bash implementation)
 */
export function renderTemplate(template: string, variables: Record<string, any>): string {
  const compiledTemplate = Handlebars.compile(template);
  return compiledTemplate(variables);
}
