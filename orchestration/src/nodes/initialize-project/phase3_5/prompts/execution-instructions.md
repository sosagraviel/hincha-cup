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

4. **Preserve the rest.** Leave correct rows, headings, ordering, and the
   grounded sections (Tech Stack, Essential Commands) untouched. Do not add
   sections, prose, or commentary.

## Budget

Be efficient: batch your `Glob`/`Grep` calls, do not crawl `node_modules`,
`.git`, build output, or other dependency/vendor directories. You only need to
confirm the specific paths the cheat-sheet claims.

## Output

Emit ONLY the corrected cheat-sheet markdown, starting with the `#` project
heading. No preamble, no code fences, no closing remarks.

---

## Cheat-sheet to verify

{{CLAUDE_MD_CONTENT}}
