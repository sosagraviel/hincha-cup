/**
 * Handlebars Helper Registration
 *
 * Registers custom Handlebars helpers for agent template rendering
 */

import Handlebars from "handlebars";

/**
 * Register all Handlebars helpers for agent generation
 * Must be called before rendering any templates
 */
export function registerHandlebarsHelpers(): void {
  // Format skills as a list for YAML-style output
  Handlebars.registerHelper("formatSkills", (skills: string[] | undefined) => {
    if (!skills?.length) return "[]";
    return "\n  - " + skills.join("\n  - ");
  });

  // Format skills as documentation markdown
  Handlebars.registerHelper("skillsDoc", (skills: string[] | undefined) => {
    if (!skills?.length) return "No skills preloaded.";
    return (
      "The following skills are preloaded and available:\n\n" +
      skills
        .map((s) => `- **${s}**: Provides patterns and conventions for this area`)
        .join("\n") +
      "\n"
    );
  });
}
