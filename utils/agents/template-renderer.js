const fs = require('fs').promises;
const path = require('path');
const Handlebars = require('handlebars');

Handlebars.registerHelper('formatSkills', (skills) =>
  !skills?.length ? '[]' : '\n  - ' + skills.join('\n  - ')
);

Handlebars.registerHelper('skillsDoc', (skills) => {
  if (!skills?.length) return 'No skills preloaded.';
  return (
    'The following skills are preloaded and available:\n\n' +
    skills
      .map((s) => `- **${s}**: Provides patterns and conventions for this area`)
      .join('\n') +
    '\n'
  );
});

async function readFile(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

async function findTemplate(templatesPath, name, language = null) {
  const paths = language
    ? [
        path.join(templatesPath, language, `${name}.template.md`),
        path.join(templatesPath, 'shared', `${name}.template.md`),
        path.join(templatesPath, `${name}.template.md`)
      ]
    : [path.join(templatesPath, `${name}.template.md`)];

  for (const p of paths) {
    const content = await readFile(p);
    if (content) return content;
  }
  return null;
}

function compileTemplate(templateContent, context) {
  const template = Handlebars.compile(templateContent);
  return template(context);
}

function createAgent(templateContent, context, metadata) {
  const { name, filename, model, description } = metadata;
  const content = compileTemplate(templateContent, context);
  return { name, filename, content, model, description };
}

module.exports = {
  findTemplate,
  compileTemplate,
  createAgent
};
