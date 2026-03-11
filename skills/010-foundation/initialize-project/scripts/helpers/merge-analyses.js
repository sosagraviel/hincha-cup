#!/usr/bin/env node

/**
 * MERGE ANALYSES
 *
 * Consolidates outputs from 4 analyzer agents into single file
 * - Deduplicates findings
 * - Cross-references between agents
 * - Identifies gaps and conflicts
 * - Creates unified analysis for synthesis phase
 */

const fs = require('fs');
const path = require('path');

/**
 * Load JSON file
 */
function loadJSON(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to load ${filePath}: ${error.message}`);
  }
}

/**
 * Deduplicate array of objects by key
 */
function deduplicateByKey(items, key) {
  const seen = new Set();
  return items.filter(item => {
    const value = item[key];
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
}

/**
 * Find overlaps between agent findings
 */
function findOverlaps(analyses) {
  const overlaps = [];

  // Look for common findings across agents
  const allFindings = analyses.flatMap((analysis, idx) => {
    return Object.entries(analysis.findings || {}).map(([category, items]) => ({
      agent: analysis.agent_name,
      agentIndex: idx,
      category,
      items: Array.isArray(items) ? items : [items]
    }));
  });

  // Group by category
  const byCategory = {};
  allFindings.forEach(finding => {
    if (!byCategory[finding.category]) {
      byCategory[finding.category] = [];
    }
    byCategory[finding.category].push(finding);
  });

  // Find categories mentioned by multiple agents
  Object.entries(byCategory).forEach(([category, findings]) => {
    if (findings.length > 1) {
      overlaps.push({
        category,
        agents: findings.map(f => f.agent),
        count: findings.length,
        confidence: 'high'
      });
    }
  });

  return overlaps;
}

/**
 * Identify gaps (missing information)
 */
function identifyGaps(analyses) {
  const gaps = [];

  // Check for NEEDS_VERIFICATION markers
  analyses.forEach(analysis => {
    if (analysis.needs_verification && analysis.needs_verification.length > 0) {
      analysis.needs_verification.forEach(item => {
        gaps.push({
          type: 'needs_verification',
          agent: analysis.agent_name,
          item: item.item,
          reason: item.reason,
          priority: 'medium'
        });
      });
    }
  });

  // Check for empty or sparse findings
  analyses.forEach(analysis => {
    const findingsCount = Object.keys(analysis.findings || {}).length;
    if (findingsCount < 3) {
      gaps.push({
        type: 'sparse_findings',
        agent: analysis.agent_name,
        count: findingsCount,
        priority: 'low',
        suggestion: 'Agent may need more detailed analysis'
      });
    }
  });

  return gaps;
}

/**
 * Detect conflicts between agent findings
 */
function detectConflicts(analyses) {
  const conflicts = [];

  // Look for contradictory information
  // Example: different tech stack detections

  const techStacks = analyses
    .filter(a => a.findings?.tech_stack || a.findings?.languages || a.findings?.frameworks)
    .map(a => ({
      agent: a.agent_name,
      languages: a.findings?.languages || a.findings?.tech_stack?.languages || [],
      frameworks: a.findings?.frameworks || a.findings?.tech_stack?.frameworks || []
    }));

  if (techStacks.length > 1) {
    // Check for language conflicts
    const allLanguages = new Set(techStacks.flatMap(ts => ts.languages));
    allLanguages.forEach(lang => {
      const agentsWithLang = techStacks.filter(ts => ts.languages.includes(lang));
      const agentsWithoutLang = techStacks.filter(ts => !ts.languages.includes(lang));

      if (agentsWithLang.length > 0 && agentsWithoutLang.length > 0) {
        conflicts.push({
          type: 'language_detection',
          language: lang,
          detectedBy: agentsWithLang.map(ts => ts.agent),
          missedBy: agentsWithoutLang.map(ts => ts.agent),
          severity: 'medium'
        });
      }
    });
  }

  return conflicts;
}

/**
 * Extract and merge multi-stack information from all agents
 */
function extractMultiStackInfo(analyses) {
  const multiStack = {
    is_monorepo: false,
    workspaces: [],
    languages: new Map(),
    total_files: 0
  };

  // Collect multi_stack info from each agent
  analyses.forEach(analysis => {
    if (analysis.findings?.multi_stack) {
      const agentMultiStack = analysis.findings.multi_stack;

      if (agentMultiStack.is_monorepo) {
        multiStack.is_monorepo = true;
      }

      // Collect workspaces (deduplicate by path)
      if (agentMultiStack.workspaces && Array.isArray(agentMultiStack.workspaces)) {
        agentMultiStack.workspaces.forEach(workspace => {
          const existing = multiStack.workspaces.find(w => w.path === workspace.path);
          if (!existing) {
            multiStack.workspaces.push(workspace);
          } else {
            // Merge workspace data if duplicate found
            Object.assign(existing, workspace);
          }
        });
      }
    }

    // Also collect language info from findings
    const langs = analysis.findings?.languages || [];
    const langArray = Array.isArray(langs) ? langs : (langs.items || []);

    langArray.forEach(lang => {
      const langName = typeof lang === 'string' ? lang : lang.name;
      const fileCount = typeof lang === 'object' ? (lang.file_count || 0) : 0;

      if (!multiStack.languages.has(langName)) {
        multiStack.languages.set(langName, {
          name: langName,
          file_count: fileCount,
          detected_by: [analysis.agent_name]
        });
      } else {
        const existing = multiStack.languages.get(langName);
        existing.detected_by.push(analysis.agent_name);
        if (fileCount > existing.file_count) {
          existing.file_count = fileCount;
        }
      }
    });
  });

  return {
    is_monorepo: multiStack.is_monorepo,
    workspaces: multiStack.workspaces,
    languages: Array.from(multiStack.languages.values()).sort((a, b) => b.file_count - a.file_count),
    total_files: Array.from(multiStack.languages.values()).reduce((sum, lang) => sum + lang.file_count, 0)
  };
}

/**
 * Detect missing language coverage
 */
function detectMissingLanguageCoverage(multiStack, merged) {
  const warnings = [];

  // Languages with significant code (>10 files) should have coverage
  multiStack.languages.forEach(lang => {
    if (lang.file_count >= 10) {
      const hasCoverage = merged.findings?.languages?.items?.some(l => {
        const langName = typeof l === 'string' ? l : l.name;
        return langName === lang.name;
      });

      if (!hasCoverage) {
        warnings.push({
          type: 'missing_language_coverage',
          language: lang.name,
          file_count: lang.file_count,
          severity: 'critical',
          message: `Language '${lang.name}' has ${lang.file_count} files but is not in consolidated findings`
        });
      }
    }
  });

  return warnings;
}

/**
 * Merge all analyses into consolidated structure
 */
function mergeAnalyses(analyses) {
  // Extract multi-stack information first
  const multiStack = extractMultiStackInfo(analyses);

  const merged = {
    timestamp: new Date().toISOString(),
    agents_count: analyses.length,
    agents: analyses.map(a => a.agent_name),

    multi_stack: multiStack,

    // Consolidated findings
    findings: {},

    // Meta-analysis
    overlaps: findOverlaps(analyses),
    gaps: identifyGaps(analyses),
    conflicts: detectConflicts(analyses),

    // Original outputs
    agent_outputs: analyses
  };

  // Merge findings by category
  const allCategories = new Set();
  analyses.forEach(analysis => {
    Object.keys(analysis.findings || {}).forEach(category => {
      allCategories.add(category);
    });
  });

  allCategories.forEach(category => {
    merged.findings[category] = {
      sources: [],
      items: []
    };

    analyses.forEach(analysis => {
      if (analysis.findings?.[category]) {
        merged.findings[category].sources.push(analysis.agent_name);

        const items = Array.isArray(analysis.findings[category])
          ? analysis.findings[category]
          : [analysis.findings[category]];

        merged.findings[category].items.push(...items);
      }
    });

    // Deduplicate items if they're strings
    if (merged.findings[category].items.every(item => typeof item === 'string')) {
      merged.findings[category].items = [...new Set(merged.findings[category].items)];
    }
  });

  // Check for missing language coverage and add to gaps
  const missingLanguageWarnings = detectMissingLanguageCoverage(multiStack, merged);
  merged.gaps.push(...missingLanguageWarnings);

  return merged;
}

/**
 * Generate summary statistics
 */
function generateSummary(merged) {
  return {
    total_agents: merged.agents_count,
    total_categories: Object.keys(merged.findings).length,
    overlaps: merged.overlaps.length,
    gaps: merged.gaps.length,
    conflicts: merged.conflicts.length,
    confidence: merged.conflicts.length === 0 && merged.gaps.length < 3 ? 'high' : 'medium'
  };
}

/**
 * Main merge function
 */
function merge(inputFiles, outputFile) {
  console.log('Merging analyses...');
  console.log(`  Input files: ${inputFiles.length}`);

  // Load all analyses
  const analyses = inputFiles.map((file, idx) => {
    console.log(`  Loading: ${file}`);
    const analysis = loadJSON(file);
    return analysis;
  });

  // Merge
  const merged = mergeAnalyses(analyses);
  const summary = generateSummary(merged);

  console.log('');
  console.log('Merge summary:');
  console.log(`  Total categories: ${summary.total_categories}`);
  console.log(`  Overlaps found: ${summary.overlaps}`);
  console.log(`  Gaps identified: ${summary.gaps}`);
  console.log(`  Conflicts detected: ${summary.conflicts}`);
  console.log(`  Confidence: ${summary.confidence}`);

  // Add summary to merged
  merged.summary = summary;

  // Write output
  fs.writeFileSync(outputFile, JSON.stringify(merged, null, 2), 'utf-8');
  console.log('');
  console.log(`✓ Consolidated analysis written to: ${outputFile}`);

  return merged;
}

/**
 * CLI interface
 */
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: merge-analyses.js <output-file> <input-file-1> [input-file-2] ...');
    console.error('Example: merge-analyses.js consolidation.json agent1.json agent2.json agent3.json agent4.json');
    process.exit(1);
  }

  const [outputFile, ...inputFiles] = args;

  // Validate input files
  inputFiles.forEach(file => {
    if (!fs.existsSync(file)) {
      console.error(`Error: Input file not found: ${file}`);
      process.exit(1);
    }
  });

  try {
    merge(inputFiles, outputFile);
    process.exit(0);
  } catch (error) {
    console.error('Error merging analyses:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

module.exports = {
  merge,
  mergeAnalyses,
  findOverlaps,
  identifyGaps,
  detectConflicts,
  generateSummary,
  extractMultiStackInfo,
  detectMissingLanguageCoverage
};
