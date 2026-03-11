#!/usr/bin/env node

/**
 * VALIDATE AGENT OUTPUT
 *
 * Validates analyzer agent outputs against JSON Schema
 * Uses ajv library for schema validation
 * Returns structured validation result with errors
 */

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const fs = require('fs');
const path = require('path');

/**
 * Validate agent output against JSON Schema
 * @param {Object} output - Agent output to validate
 * @param {string} schemaName - Schema file name (e.g., 'phase1-analysis')
 * @param {string} schemasDir - Path to schemas directory
 * @returns {Object} - {valid: boolean, errors: array, data: object}
 */
function validateAgentOutput(output, schemaName, schemasDir) {
  try {
    // Load schema
    const schemaPath = path.join(schemasDir, `${schemaName}.schema.json`);
    if (!fs.existsSync(schemaPath)) {
      return {
        valid: false,
        errors: [{
          message: `Schema file not found: ${schemaPath}`,
          type: 'schema_not_found'
        }],
        data: null
      };
    }

    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));

    // Initialize AJV with formats
    const ajv = new Ajv({
      allErrors: true,
      verbose: true,
      strict: false
    });
    addFormats(ajv);

    // Compile schema
    const validate = ajv.compile(schema);

    // Parse output if string
    let parsedOutput = output;
    if (typeof output === 'string') {
      try {
        parsedOutput = JSON.parse(output);
      } catch (parseError) {
        return {
          valid: false,
          errors: [{
            message: 'Invalid JSON: ' + parseError.message,
            type: 'json_parse_error',
            details: parseError.message
          }],
          data: null
        };
      }
    }

    // Validate
    const valid = validate(parsedOutput);

    if (!valid) {
      const errors = validate.errors.map(err => ({
        message: err.message,
        path: err.instancePath || err.dataPath,
        keyword: err.keyword,
        params: err.params,
        type: 'schema_validation_error'
      }));

      return {
        valid: false,
        errors,
        data: parsedOutput
      };
    }

    // Success
    return {
      valid: true,
      errors: [],
      data: parsedOutput
    };

  } catch (error) {
    return {
      valid: false,
      errors: [{
        message: 'Validation error: ' + error.message,
        type: 'validation_system_error',
        details: error.stack
      }],
      data: null
    };
  }
}

/**
 * Validate multiple agent outputs
 * @param {Array} outputs - Array of {output, schemaName} objects
 * @param {string} schemasDir - Path to schemas directory
 * @returns {Object} - {allValid: boolean, results: array}
 */
function validateMultipleOutputs(outputs, schemasDir) {
  const results = outputs.map((item, index) => {
    const result = validateAgentOutput(item.output, item.schemaName, schemasDir);
    return {
      index,
      agentName: item.agentName || `agent-${index}`,
      schemaName: item.schemaName,
      ...result
    };
  });

  const allValid = results.every(r => r.valid);

  return {
    allValid,
    results,
    summary: {
      total: results.length,
      valid: results.filter(r => r.valid).length,
      invalid: results.filter(r => !r.valid).length
    }
  };
}

/**
 * CLI interface
 */
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.error('Usage: validate-agent-output.js <output-file> <schema-name> <schemas-dir>');
    console.error('Example: validate-agent-output.js output.json phase1-analysis ./config/schemas');
    process.exit(1);
  }

  const [outputFile, schemaName, schemasDir] = args;

  // Read output file
  if (!fs.existsSync(outputFile)) {
    console.error(`Error: Output file not found: ${outputFile}`);
    process.exit(1);
  }

  const output = fs.readFileSync(outputFile, 'utf-8');

  // Validate
  const result = validateAgentOutput(output, schemaName, schemasDir);

  // Output result
  if (result.valid) {
    console.log('✓ Validation passed');
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } else {
    console.error('✗ Validation failed');
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }
}

module.exports = {
  validateAgentOutput,
  validateMultipleOutputs
};
