# Contributing

This is a fixture, not a real project. Changes here should preserve the
"production-realistic config breadth" invariant:

- Don't delete a category of file (CI workflow, husky hook, env template,
  …) just to "simplify the fixture".
- Trim by VOLUME (fewer source files) not by REMOVING a config TYPE.
- Source-file count budget: ≤ 30 (see `.fixture-meta.json`).

Run `pnpm test:unit -- integration-fixtures/sanity` to validate the
fixture before committing.
