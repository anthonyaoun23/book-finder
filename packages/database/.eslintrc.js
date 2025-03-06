module.exports = {
  root: true,
  extends: ['@repo/eslint-config/base'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    tsconfigRootDir: __dirname,
  }
};
