# AGENTS

This repository is a React Native + Expo app using TypeScript and Expo Router.
Keep changes aligned with existing patterns and keep UX minimal and tool-like.

## Project Overview
- App purpose: generate a color palette from a photo.
- Stack: React Native, Expo, Expo Router, TypeScript (strict).
- UI: functional components + hooks, StyleSheet-based styles.
- Routing: file-based routing under `app/`.
- Local processing only; no backend for MVP.

## Repo Map
- `app/`: screen routes and layouts (Expo Router).
- `components/`: reusable UI components.
- `hooks/`: custom hooks (e.g. color scheme, theme color).
- `constants/`: shared constants like colors and fonts.
- `assets/`: images and static assets.
- `scripts/`: project scripts like reset project.
- `app.json`: Expo app configuration.
- `tsconfig.json`: TypeScript config with path alias `@/*`.

## Install + Run
- Install deps: `npm install`
- Start dev server: `npm run start`
- Run iOS: `npm run ios`
- Run Android: `npm run android`
- Run web: `npm run web`

## Build / Lint / Test
- Lint: `npm run lint` (uses `expo lint`)
- Targeted lint file: `npx eslint path/to/file.tsx`
- Build: no build script in `package.json`.
- Release builds: use Expo/EAS workflows if/when configured.
- Tests: no test runner configured.

## Single Test Guidance
- There is no Jest/Vitest config in this repo today.
- For a single test, add a test runner first, then document here.
- Until then, rely on manual testing via `expo start`.

## Formatting and Style
- Use 2-space indentation.
- Prefer single quotes for strings.
- Semicolons are mixed; preserve the local file style.
- Keep JSX props formatting consistent with the file you edit.
- Avoid large inline style objects when a StyleSheet makes sense.
- Use trailing commas in multi-line objects/arrays where present.
- Do not add comments unless the logic is non-obvious.

## Imports
- Order imports: external modules first, then local `@/` imports.
- Use `@/` path alias for internal modules.
- Prefer `import type` or inline `type` for type-only imports.
- Only import `React` when needed by the file or tooling.

## Types
- TypeScript `strict` is enabled; avoid `any`.
- Define explicit prop types for components.
- Use union types for limited string options.
- Prefer `type` for object shapes unless you need `interface` merging.
- Keep types close to usage; avoid exporting unnecessary types.

## Naming Conventions
- Components: `PascalCase`.
- Hooks: `useSomething` in `hooks/`.
- Files: kebab-case for component files (e.g. `themed-text.tsx`).
- Constants: `UPPER_SNAKE_CASE` for literals, `camelCase` for objects.
- Functions and variables: `camelCase`.

## React Native Patterns
- Screens are default exports in `app/` routes.
- Shared UI uses named exports in `components/`.
- Prefer `StyleSheet.create` for reusable styles.
- Use `ThemedText` and `ThemedView` for theme-aware rendering.
- Use `Colors` and `Fonts` from `constants/theme` for consistency.
- Prefer hooks for state and effects; avoid class components.
- Platform-specific logic should use `Platform.select`.

## UX Principles
- Clean, minimal, professional UI.
- Tool-like experience similar to creative utilities.
- Prioritize clarity, speed, and usability.
- Avoid gamification or decorative clutter.
- Maintain strong hierarchy and spacing.

## Theme and Styling
- Use `useColorScheme` and `useThemeColor` for color-aware UI.
- Keep colors centralized in `constants/theme`.
- Prefer theme-aware components for text and surfaces.
- Keep typography choices consistent across screens.
- Avoid introducing new font families unless required.

## State and Data Flow
- Keep state local to a screen or component when possible.
- Lift shared state only when multiple routes need it.
- Use hooks for async effects and subscriptions.
- Memoize derived values only when they are expensive.
- Avoid global state until a clear need exists.

## Error Handling
- Wrap async operations in `try/catch`.
- Surface user-friendly messages for failures.
- Avoid throwing inside render paths.
- Log unexpected errors with `console.error` during development.

## Assets
- Use `require('@/assets/...')` for static images.
- Keep new assets under `assets/`.
- Do not inline large base64 images in code.

## Routing and Navigation
- Root layout: `app/_layout.tsx`.
- Tab layout: `app/(tabs)/_layout.tsx`.
- New routes map directly to files under `app/`.
- Keep navigation options close to the screen definition.

## Linting Notes
- ESLint config is `eslint.config.js` with `eslint-config-expo`.
- Use `npx eslint --fix path/to/file.tsx` for quick fixes.
- If adding a new rule set, keep it compatible with Expo defaults.

## Tooling Rules
- No Prettier configuration is present.
- Keep formatting consistent with the file you edit.
- Do not add additional tooling unless requested.

## Cursor / Copilot Rules
- No `.cursor/rules/` directory found.
- No `.cursorrules` file found.
- No `.github/copilot-instructions.md` file found.

## Docs and Context
- `docs/context` does not exist in this repo.
- If it gets added later, read it before major changes.

## If You Add Tests Later
- Prefer a single test runner (Jest or Vitest), not both.
- Document the test command in this file.
- Add a single-test example like `npm test -- path/to/test`.
- Keep test utilities under a `tests/` or `__tests__/` folder.

## If You Add Build Steps Later
- Add explicit scripts in `package.json`.
- Document build targets for iOS, Android, and web.
- Note any environment variables required to build.

## Safe Defaults for Agents
- Follow existing patterns in the file you touch.
- Keep UI minimal and professional.
- Prefer small, incremental changes.
- Update this file if tooling or conventions change.
