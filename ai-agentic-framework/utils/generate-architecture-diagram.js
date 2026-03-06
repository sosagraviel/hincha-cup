#!/usr/bin/env node

/**
 * Architecture Diagram Generator
 *
 * Analyzes git diff and generates Mermaid architecture diagrams for PRs.
 * Provides visual representation of changes for instant PR reviewability.
 *
 * Usage:
 *   node utils/generate-architecture-diagram.js [base-commit] [head-commit]
 *   node utils/generate-architecture-diagram.js --ticket JIRA-KEY
 *
 * @version 1.0.0
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const OUTPUT_DIR = '.claude/diagrams';
const DIAGRAM_TYPES = ['component', 'sequence', 'class', 'er'];

/**
 * Main entry point
 * @param {string} baseCommit - Base commit SHA (default: HEAD~1)
 * @param {string} headCommit - Head commit SHA (default: HEAD)
 * @param {string} jiraKey - Optional Jira ticket key
 * @returns {Promise<Object>} Generation report
 */
async function generateArchitectureDiagram(baseCommit = 'HEAD~1', headCommit = 'HEAD', jiraKey = null) {
  console.log('📐 Architecture Diagram Generator');
  console.log('=================================\n');

  const report = {
    baseCommit,
    headCommit,
    jiraKey,
    diagrams: [],
    analysisTime: 0,
    success: false,
    error: null
  };

  const startTime = Date.now();

  try {
    // Create output directory
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Step 1: Analyze git diff
    console.log(`📊 Analyzing changes: ${baseCommit}...${headCommit}`);
    const diffAnalysis = analyzeGitDiff(baseCommit, headCommit);
    report.diffAnalysis = diffAnalysis;

    console.log(`   Files changed: ${diffAnalysis.filesChanged.length}`);
    console.log(`   Additions: +${diffAnalysis.additions} lines`);
    console.log(`   Deletions: -${diffAnalysis.deletions} lines`);
    console.log('');

    // Step 2: Detect change type and generate appropriate diagrams
    const changeTypes = detectChangeTypes(diffAnalysis);
    console.log(`🔍 Detected change types: ${changeTypes.join(', ')}`);
    console.log('');

    // Step 3: Generate diagrams based on change types
    if (changeTypes.includes('component') || changeTypes.includes('frontend')) {
      const componentDiagram = generateComponentDiagram(diffAnalysis);
      if (componentDiagram) {
        const filename = jiraKey ? `${jiraKey}-component.mmd` : 'component-architecture.mmd';
        const filepath = path.join(OUTPUT_DIR, filename);
        fs.writeFileSync(filepath, componentDiagram, 'utf-8');
        report.diagrams.push({ type: 'component', path: filepath });
        console.log(`✓ Generated component diagram: ${filepath}`);
      }
    }

    if (changeTypes.includes('api') || changeTypes.includes('backend')) {
      const sequenceDiagram = generateSequenceDiagram(diffAnalysis);
      if (sequenceDiagram) {
        const filename = jiraKey ? `${jiraKey}-sequence.mmd` : 'api-sequence.mmd';
        const filepath = path.join(OUTPUT_DIR, filename);
        fs.writeFileSync(filepath, sequenceDiagram, 'utf-8');
        report.diagrams.push({ type: 'sequence', path: filepath });
        console.log(`✓ Generated sequence diagram: ${filepath}`);
      }
    }

    if (changeTypes.includes('database') || changeTypes.includes('model')) {
      const erDiagram = generateERDiagram(diffAnalysis);
      if (erDiagram) {
        const filename = jiraKey ? `${jiraKey}-er.mmd` : 'database-schema.mmd';
        const filepath = path.join(OUTPUT_DIR, filename);
        fs.writeFileSync(filepath, erDiagram, 'utf-8');
        report.diagrams.push({ type: 'er', path: filepath });
        console.log(`✓ Generated ER diagram: ${filepath}`);
      }
    }

    if (changeTypes.includes('class') || changeTypes.includes('service')) {
      const classDiagram = generateClassDiagram(diffAnalysis);
      if (classDiagram) {
        const filename = jiraKey ? `${jiraKey}-class.mmd` : 'class-structure.mmd';
        const filepath = path.join(OUTPUT_DIR, filename);
        fs.writeFileSync(filepath, classDiagram, 'utf-8');
        report.diagrams.push({ type: 'class', path: filepath });
        console.log(`✓ Generated class diagram: ${filepath}`);
      }
    }

    // Step 4: Generate overview diagram (always)
    const overviewDiagram = generateOverviewDiagram(diffAnalysis, changeTypes);
    const overviewFilename = jiraKey ? `${jiraKey}-overview.mmd` : 'architecture-overview.mmd';
    const overviewPath = path.join(OUTPUT_DIR, overviewFilename);
    fs.writeFileSync(overviewPath, overviewDiagram, 'utf-8');
    report.diagrams.push({ type: 'overview', path: overviewPath });
    console.log(`✓ Generated overview diagram: ${overviewPath}`);

    report.analysisTime = Date.now() - startTime;
    report.success = true;

    console.log('');
    console.log(`✅ Generated ${report.diagrams.length} diagrams in ${report.analysisTime}ms`);
    console.log('');

    return report;
  } catch (error) {
    report.error = error.message;
    report.analysisTime = Date.now() - startTime;
    console.error(`\n❌ Failed to generate diagrams: ${error.message}\n`);
    throw error;
  }
}

/**
 * Analyze git diff to extract change information
 */
function analyzeGitDiff(baseCommit, headCommit) {
  const analysis = {
    filesChanged: [],
    additions: 0,
    deletions: 0,
    filesByType: {
      frontend: [],
      backend: [],
      database: [],
      config: [],
      test: [],
      other: []
    },
    newFiles: [],
    modifiedFiles: [],
    deletedFiles: [],
    functionsAdded: [],
    classesAdded: [],
    apiEndpoints: [],
    databaseModels: []
  };

  try {
    // Get diff stats
    const diffStat = execSync(`git diff --stat ${baseCommit}...${headCommit}`, { encoding: 'utf-8' });
    const statLines = diffStat.trim().split('\n');

    statLines.forEach(line => {
      const match = line.match(/^(.+?)\s+\|\s+(\d+)\s+([+-]+)$/);
      if (match) {
        const filename = match[1].trim();
        const changes = parseInt(match[2]);
        const addDel = match[3];

        analysis.filesChanged.push(filename);

        // Categorize by file type
        categorizeFile(filename, analysis.filesByType);
      }
    });

    // Get file status (new, modified, deleted)
    const diffNameStatus = execSync(`git diff --name-status ${baseCommit}...${headCommit}`, { encoding: 'utf-8' });
    const statusLines = diffNameStatus.trim().split('\n');

    statusLines.forEach(line => {
      const [status, filename] = line.split('\t');
      if (status === 'A') {
        analysis.newFiles.push(filename);
      } else if (status === 'M') {
        analysis.modifiedFiles.push(filename);
      } else if (status === 'D') {
        analysis.deletedFiles.push(filename);
      }
    });

    // Get diff content for detailed analysis
    const diffContent = execSync(`git diff ${baseCommit}...${headCommit}`, { encoding: 'utf-8' });

    // Extract additions and deletions count
    const additionsMatch = diffContent.match(/\n\+[^+]/g);
    const deletionsMatch = diffContent.match(/\n-[^-]/g);
    analysis.additions = additionsMatch ? additionsMatch.length : 0;
    analysis.deletions = deletionsMatch ? deletionsMatch.length : 0;

    // Parse for specific patterns
    analysis.functionsAdded = extractFunctions(diffContent);
    analysis.classesAdded = extractClasses(diffContent);
    analysis.apiEndpoints = extractAPIEndpoints(diffContent);
    analysis.databaseModels = extractDatabaseModels(diffContent);

  } catch (error) {
    console.warn(`Warning: Git diff analysis failed: ${error.message}`);
  }

  return analysis;
}

/**
 * Categorize file by type
 */
function categorizeFile(filename, filesByType) {
  if (filename.match(/\.(tsx?|jsx?|vue|svelte)$/) && filename.includes('component')) {
    filesByType.frontend.push(filename);
  } else if (filename.match(/\.(ts|js)$/) && (filename.includes('controller') || filename.includes('route') || filename.includes('handler'))) {
    filesByType.backend.push(filename);
  } else if (filename.match(/\.(sql|migration|model|entity)/) || filename.includes('schema')) {
    filesByType.database.push(filename);
  } else if (filename.match(/\.(json|yaml|yml|toml|env)$/) || filename.includes('config')) {
    filesByType.config.push(filename);
  } else if (filename.match(/\.(test|spec)\.(ts|js|tsx|jsx)$/)) {
    filesByType.test.push(filename);
  } else {
    filesByType.other.push(filename);
  }
}

/**
 * Detect types of changes made
 */
function detectChangeTypes(analysis) {
  const types = new Set();

  if (analysis.filesByType.frontend.length > 0) {
    types.add('frontend');
    types.add('component');
  }

  if (analysis.filesByType.backend.length > 0) {
    types.add('backend');
    types.add('api');
  }

  if (analysis.filesByType.database.length > 0) {
    types.add('database');
    types.add('model');
  }

  if (analysis.classesAdded.length > 0) {
    types.add('class');
    types.add('service');
  }

  if (analysis.apiEndpoints.length > 0) {
    types.add('api');
  }

  if (types.size === 0) {
    types.add('general');
  }

  return Array.from(types);
}

/**
 * Extract function definitions from diff
 */
function extractFunctions(diffContent) {
  const functions = [];
  const functionRegex = /^\+.*(?:function|const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*[=\(]/gm;
  let match;

  while ((match = functionRegex.exec(diffContent)) !== null) {
    functions.push(match[1]);
  }

  return [...new Set(functions)]; // Deduplicate
}

/**
 * Extract class definitions from diff
 */
function extractClasses(diffContent) {
  const classes = [];
  const classRegex = /^\+.*(?:class|interface|type)\s+([A-Z][a-zA-Z0-9_]*)/gm;
  let match;

  while ((match = classRegex.exec(diffContent)) !== null) {
    classes.push(match[1]);
  }

  return [...new Set(classes)];
}

/**
 * Extract API endpoints from diff
 */
function extractAPIEndpoints(diffContent) {
  const endpoints = [];
  const routeRegex = /^\+.*(?:@(?:Get|Post|Put|Delete|Patch)|router\.(?:get|post|put|delete|patch))\s*\(['"`]([^'"`]+)['"`]/gm;
  let match;

  while ((match = routeRegex.exec(diffContent)) !== null) {
    endpoints.push(match[1]);
  }

  return [...new Set(endpoints)];
}

/**
 * Extract database models from diff
 */
function extractDatabaseModels(diffContent) {
  const models = [];
  const modelRegex = /^\+.*@Entity\s*\(\s*['"`]([^'"`]+)['"`]|CREATE\s+TABLE\s+([a-z_]+)/gmi;
  let match;

  while ((match = modelRegex.exec(diffContent)) !== null) {
    models.push(match[1] || match[2]);
  }

  return [...new Set(models)];
}

/**
 * Generate component architecture diagram (Mermaid)
 */
function generateComponentDiagram(analysis) {
  if (analysis.filesByType.frontend.length === 0) {
    return null;
  }

  const components = analysis.filesByType.frontend.map(file => {
    const name = path.basename(file, path.extname(file));
    return name;
  });

  let diagram = `graph TD\n`;
  diagram += `  subgraph "Frontend Components"\n`;

  components.forEach((comp, index) => {
    const compId = `comp${index}`;
    const isNew = analysis.newFiles.some(f => f.includes(comp));
    const style = isNew ? ':::newNode' : ':::modifiedNode';
    diagram += `    ${compId}["${comp}"]${style}\n`;
  });

  diagram += `  end\n\n`;
  diagram += `  classDef newNode fill:#90EE90,stroke:#2E7D32,stroke-width:2px\n`;
  diagram += `  classDef modifiedNode fill:#FFD54F,stroke:#F57F17,stroke-width:2px\n`;

  return diagram;
}

/**
 * Generate API sequence diagram (Mermaid)
 */
function generateSequenceDiagram(analysis) {
  if (analysis.apiEndpoints.length === 0 && analysis.filesByType.backend.length === 0) {
    return null;
  }

  let diagram = `sequenceDiagram\n`;
  diagram += `  participant Client\n`;
  diagram += `  participant API\n`;

  if (analysis.filesByType.database.length > 0) {
    diagram += `  participant DB\n`;
  }

  diagram += `\n`;

  // Add API endpoints
  analysis.apiEndpoints.slice(0, 5).forEach(endpoint => {
    const method = endpoint.match(/^(GET|POST|PUT|DELETE|PATCH)/i) || ['GET'];
    diagram += `  Client->>+API: ${method[0]} ${endpoint}\n`;

    if (analysis.filesByType.database.length > 0) {
      diagram += `  API->>+DB: Query data\n`;
      diagram += `  DB-->>-API: Return result\n`;
    }

    diagram += `  API-->>-Client: Response\n`;
    diagram += `\n`;
  });

  return diagram;
}

/**
 * Generate ER diagram for database changes (Mermaid)
 */
function generateERDiagram(analysis) {
  if (analysis.databaseModels.length === 0 && analysis.filesByType.database.length === 0) {
    return null;
  }

  let diagram = `erDiagram\n`;

  analysis.databaseModels.forEach(model => {
    diagram += `  ${model.toUpperCase()} {\n`;
    diagram += `    int id PK\n`;
    diagram += `    string name\n`;
    diagram += `    datetime created_at\n`;
    diagram += `    datetime updated_at\n`;
    diagram += `  }\n\n`;
  });

  return diagram;
}

/**
 * Generate class diagram (Mermaid)
 */
function generateClassDiagram(analysis) {
  if (analysis.classesAdded.length === 0) {
    return null;
  }

  let diagram = `classDiagram\n`;

  analysis.classesAdded.forEach(className => {
    diagram += `  class ${className} {\n`;

    // Add placeholder methods
    const methods = analysis.functionsAdded.filter(f =>
      f.toLowerCase().includes(className.toLowerCase().slice(0, 5))
    );

    if (methods.length > 0) {
      methods.slice(0, 5).forEach(method => {
        diagram += `    +${method}()\n`;
      });
    } else {
      diagram += `    +constructor()\n`;
      diagram += `    +method()\n`;
    }

    diagram += `  }\n\n`;
  });

  return diagram;
}

/**
 * Generate overview diagram showing all changes (Mermaid)
 */
function generateOverviewDiagram(analysis, changeTypes) {
  let diagram = `graph LR\n`;
  diagram += `  subgraph "Changes Overview"\n`;

  const stats = [
    `Files: ${analysis.filesChanged.length}`,
    `New: ${analysis.newFiles.length}`,
    `Modified: ${analysis.modifiedFiles.length}`,
    `Deleted: ${analysis.deletedFiles.length}`
  ];

  diagram += `    stats["${stats.join('<br/>')}"]:::infoNode\n`;

  if (analysis.filesByType.frontend.length > 0) {
    diagram += `    frontend["Frontend<br/>${analysis.filesByType.frontend.length} files"]:::frontendNode\n`;
    diagram += `    stats --> frontend\n`;
  }

  if (analysis.filesByType.backend.length > 0) {
    diagram += `    backend["Backend<br/>${analysis.filesByType.backend.length} files"]:::backendNode\n`;
    diagram += `    stats --> backend\n`;
  }

  if (analysis.filesByType.database.length > 0) {
    diagram += `    database["Database<br/>${analysis.filesByType.database.length} files"]:::dbNode\n`;
    diagram += `    stats --> database\n`;
  }

  if (analysis.filesByType.test.length > 0) {
    diagram += `    tests["Tests<br/>${analysis.filesByType.test.length} files"]:::testNode\n`;
    diagram += `    stats --> tests\n`;
  }

  diagram += `  end\n\n`;

  // Add styling
  diagram += `  classDef infoNode fill:#E3F2FD,stroke:#1976D2,stroke-width:2px\n`;
  diagram += `  classDef frontendNode fill:#F3E5F5,stroke:#7B1FA2,stroke-width:2px\n`;
  diagram += `  classDef backendNode fill:#E8F5E9,stroke:#388E3C,stroke-width:2px\n`;
  diagram += `  classDef dbNode fill:#FFF3E0,stroke:#F57C00,stroke-width:2px\n`;
  diagram += `  classDef testNode fill:#FCE4EC,stroke:#C2185B,stroke-width:2px\n`;

  return diagram;
}

/**
 * CLI execution
 */
async function main() {
  const args = process.argv.slice(2);

  let baseCommit = 'HEAD~1';
  let headCommit = 'HEAD';
  let jiraKey = null;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--ticket' && args[i + 1]) {
      jiraKey = args[i + 1];
      i++;
    } else if (args[i] === '--base' && args[i + 1]) {
      baseCommit = args[i + 1];
      i++;
    } else if (args[i] === '--head' && args[i + 1]) {
      headCommit = args[i + 1];
      i++;
    } else if (!args[i].startsWith('--')) {
      if (i === 0) baseCommit = args[i];
      if (i === 1) headCommit = args[i];
    }
  }

  try {
    const report = await generateArchitectureDiagram(baseCommit, headCommit, jiraKey);

    console.log('📋 Summary:');
    console.log(`   Diagrams generated: ${report.diagrams.length}`);
    report.diagrams.forEach(d => {
      console.log(`   - ${d.type}: ${d.path}`);
    });
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = {
  generateArchitectureDiagram,
  analyzeGitDiff,
  detectChangeTypes
};
