import tsNextConfig from "@livonit/eslint-ts";
export default {
  ...tsNextConfig,
  overrides: [
    {
      files: ["src/**/*.ts"],
      rules: {
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/explicit-module-boundary-types": "off",
      },
    },
  ],
};
