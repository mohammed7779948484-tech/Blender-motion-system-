import { config } from "@remotion/eslint-config-flat";

export default [
  ...config,
  {
    // Omitting keys with a rest pattern (`const { at: _at, ...data } = f`) is intended, not an unused variable.
    rules: { "@typescript-eslint/no-unused-vars": ["error", { ignoreRestSiblings: true }] },
  },
];
