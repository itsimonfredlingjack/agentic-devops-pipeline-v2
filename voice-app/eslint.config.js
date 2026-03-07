import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default tseslint.config(
  // Global ignores
  {
    ignores: ["dist/", "node_modules/", "coverage/", ".vite/"],
  },

  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript recommended rules (type-checked where possible)
  ...tseslint.configs.recommended,

  // React Hooks + React Refresh for all TSX/TS files in src/
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      // React Hooks
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // React Refresh (Vite HMR)
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },

  // Relax rules for test files
  {
    files: ["src/__tests__/**/*.{ts,tsx}", "src/test-setup.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
);
