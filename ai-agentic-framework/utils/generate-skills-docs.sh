#!/bin/bash

# Generate Skills Reference Documentation
# Auto-generates SKILLS_REFERENCE.md from skills metadata

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AI_STORE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SKILLS_DIR="$AI_STORE_DIR/skills"
OUTPUT_FILE="$AI_STORE_DIR/docs/SKILLS_REFERENCE.md"

echo "Generating Skills Reference Documentation..."
echo "Scanning: $SKILLS_DIR"
echo "Output: $OUTPUT_FILE"

# Start building the output
cat > "$OUTPUT_FILE" << 'EOF'
# Skills Reference

**Auto-Generated Skills Catalog**
**Last Updated**: $(date +%Y-%m-%d)
**Total Skills**: (calculating...)

---

## Table of Contents

1. [Foundation Skills](#foundation-skills)
2. [Development Workflow Skills](#development-workflow-skills)
3. [Quality Assurance Skills](#quality-assurance-skills)
4. [Integration Skills](#integration-skills)
5. [Language & Framework Skills](#language--framework-skills)
6. [Documentation Skills](#documentation-skills)
7. [Infrastructure Skills](#infrastructure-skills)
8. [Cloud Platform Skills](#cloud-platform-skills)
9. [Detection Patterns](#detection-patterns)

---

EOF

# Function to extract YAML frontmatter
extract_frontmatter() {
  local file="$1"
  local key="$2"

  # Extract value from YAML frontmatter (between --- markers)
  awk -v key="$key" '
    /^---$/ { in_frontmatter = !in_frontmatter; next }
    in_frontmatter && $1 == key ":" {
      sub(/^[^:]+: */, "")
      gsub(/"/, "")
      print
      exit
    }
  ' "$file"
}

# Function to process skills by category
process_category() {
  local category_name="$1"
  local category_pattern="$2"

  echo ""
  echo "## ${category_name} Skills"
  echo ""

  # Find all SKILL.md files in this category
  find "$SKILLS_DIR/$category_pattern" -name "SKILL.md" -type f 2>/dev/null | sort | while read -r skill_file; do
    # Extract metadata
    name=$(extract_frontmatter "$skill_file" "name")
    description=$(extract_frontmatter "$skill_file" "description")
    category=$(extract_frontmatter "$skill_file" "category")
    always_copy=$(extract_frontmatter "$skill_file" "always_copy")

    # Skip if no name
    [ -z "$name" ] && continue

    echo "### /$name"
    echo ""
    echo "**Category**: $category"
    echo "**Description**: $description"
    echo "**Always Copied**: ${always_copy:-No}"
    echo ""

    # Extract first paragraph after frontmatter as "When to Use"
    when_to_use=$(awk '
      /^---$/ { count++; next }
      count == 2 && /^##/ { in_section = ($0 ~ /When to Use|Purpose/) }
      count == 2 && in_section && /^[^#]/ && NF > 0 { print; exit }
    ' "$skill_file")

    if [ -n "$when_to_use" ]; then
      echo "**When to Use**: $when_to_use"
      echo ""
    fi

    echo "---"
    echo ""
  done
}

# Generate skill sections by category
{
  process_category "Foundation" "010-foundation"
  process_category "Development Workflow" "020-development-workflow"
  process_category "Quality Assurance" "030-quality-assurance"
  process_category "Integration" "040-integrations"
  process_category "Language & Framework" "050-language-frameworks"
  process_category "Documentation" "060-documentation"
  process_category "Infrastructure" "070-infrastructure"
  process_category "Cloud Platform" "080-cloud-platforms"
} >> "$OUTPUT_FILE"

# Count total skills
total_skills=$(find "$SKILLS_DIR" -name "SKILL.md" -type f | wc -l | tr -d ' ')

# Update total count
sed -i.bak "s/Total Skills**: (calculating...)/Total Skills**: $total_skills/" "$OUTPUT_FILE"
rm -f "$OUTPUT_FILE.bak"

# Update last updated date
sed -i.bak "s/Last Updated\*\*: \$(date +%Y-%m-%d)/Last Updated**: $(date +%Y-%m-%d)/" "$OUTPUT_FILE"
rm -f "$OUTPUT_FILE.bak"

# Append footer
cat >> "$OUTPUT_FILE" << 'EOF'

---

## Summary Statistics

**Total Skills**: (calculated above)

**By Category**:
- Foundation: (auto-counted)
- Development Workflow: (auto-counted)
- Quality Assurance: (auto-counted)
- Integrations: (auto-counted)
- Language & Framework: (auto-counted)
- Documentation: (auto-counted)
- Infrastructure: (auto-counted)
- Cloud Platforms: (auto-counted)

---

## Contributing

To add a new skill to this catalog:

1. Create skill in `ai-agentic-framework/skills/{category}/{skill-name}/`
2. Add frontmatter metadata following the schema
3. Run: `./ai-agentic-framework/utils/generate-skills-docs.sh`
4. This document will auto-regenerate

---

**Last Generated**: $(date +%Y-%m-%d)
**Generator**: generate-skills-docs.sh
**Maintainer**: AI Team
EOF

echo "✓ Skills reference documentation generated: $OUTPUT_FILE"
echo "✓ Total skills documented: $total_skills"
