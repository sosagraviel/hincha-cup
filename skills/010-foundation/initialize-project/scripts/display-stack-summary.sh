#!/bin/bash
# Display detected stack summary from stack-profile.json

STACK_PROFILE_JSON="$1"

cat "$STACK_PROFILE_JSON" | node -e "
const p = JSON.parse(require('fs').readFileSync(0));
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  DETECTED STACK PROFILE');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

if (p.languages && p.languages.length > 1) {
  console.log(\`Languages: \${p.languages.map(l => l.name).join(', ')}\`);
}
console.log(\`Primary Language: \${p.primary_language}\`);
if (p.package_manager) console.log(\`Package Manager: \${p.package_manager}\`);
if (p.backend_frameworks?.length) {
  console.log(\`Backend: \${p.backend_frameworks.map(f => f.name || f.framework).join(', ')}\`);
}
if (p.frontend_frameworks?.length) {
  console.log(\`Frontend: \${p.frontend_frameworks.map(f => f.name || f.framework).join(', ')}\`);
}
if (p.databases?.length) {
  console.log(\`Databases: \${p.databases.map(d => d.name).join(', ')}\`);
}
if (p.testing?.length) {
  const tests = p.testing.map(t => t.name).join(', ');
  console.log(\`Testing: \${tests}\`);
}
if (p.containers?.length) {
  console.log(\`Containers: \${p.containers.map(c => c.name).join(', ')}\`);
}
if (p.project_type) {
  console.log(\`Project Type: \${p.project_type}\`);
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
"
