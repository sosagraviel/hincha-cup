# Execution Instructions — Context Verifier

You are given the generated cheat-sheet content below. The project root is your
working directory; all paths in the cheat-sheet are relative to it.

## Procedure

1. **Inventory the claims.** Scan the cheat-sheet for every path-like token:
   File Placement `Location Pattern` + `Example` cells, the Directory Structure
   tree, any inline `path/like/this`, and the Services & Ports rows.

2. **Check each claim against disk.**
   - For an exact path: `Glob` / `Read` it.
   - For a `{placeholder}` pattern: glob the concrete form (replace each
     placeholder with `*`) and confirm at least one real match exists; verify
     the `Example` cell is one such real file.
   - For a directory-tree entry: glob the directory.
   - For Services & Ports: read `docker-compose*.y*ml` and the service manifests
     to decide which rows are the same running app.

3. **Repair.**
   - Broken path with a discoverable real equivalent → fix it to the real path.
   - Broken path with no equivalent → delete that row/line.
   - Duplicate service rows (alias of a real source service on the same port) →
     keep the real service, drop the alias. Keep genuinely distinct services
     (e.g. a separate dev server on a different port is NOT a duplicate).
   - Tech Stack with several service bullets repeating the same technology →
     consolidate: factor the shared techs into one `- **Shared**: …` bullet at
     the top of the section and leave each service bullet showing only its unique
     techs. Confirm a tech is genuinely shared (it appears in those services'
     manifests) before merging. Never drop a technology outright, never alter a
     version. Leave a single-service Tech Stack unchanged.

4. **Preserve the rest.** Leave correct rows, headings, ordering, the Essential
   Commands section, and every version string untouched. Do not add sections,
   prose, or commentary.

## Budget

Be efficient: batch your `Glob`/`Grep` calls, do not crawl `node_modules`,
`.git`, build output, or other dependency/vendor directories. You only need to
confirm the specific paths the cheat-sheet claims.

## Output

Your entire response IS the file content written verbatim to `CLAUDE.md`. Emit
ONLY the corrected cheat-sheet markdown:

- First character is `#` (the project-name heading); last line is real content.
- Do NOT prepend a summary of what you changed (e.g. "Dropping the two alias
  rows…") — that sentence would be written into `CLAUDE.md`. It is a bug.
- No trailing changelog/notes, no code fences, no `# CLAUDE.md Content` wrapper.

Keep any explanation of your edits in your reasoning only — never in the output.

---

## Cheat-sheet to verify

{{CLAUDE_MD_CONTENT}}
