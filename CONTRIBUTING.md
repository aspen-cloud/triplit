# Contributing to Triplit

We welcome contributions to Triplit! If you have an idea for a feature or change to Triplit, please open a GitHub discussion. If you have a bug to report, please open a GitHub issue. You can also come to our [Discord server](https://discord.gg/q89sGWHqQ5) to get help with a bug, discuss a feature or see what others are building.

## About the monorepo

Triplit is a monorepo managed with [Yarn Workspaces](https://yarnpkg.com/features/workspaces).

It's divided into two main parts:

- `packages/` contains the Triplit packages.
- `templates/` contains examples apps that use Triplit.

## Getting started

1. Clone the repository
2. Run `yarn install` to install the dependencies
3. Run `yarn build:packages` to build the packages

## Building packages

Triplit's packages are interconnected e.g. `@triplit/client` depends on `@triplit/db`. Each package consumes the build artifacts of the packages it depends on. This means that if you make a change to package, you'll need to rebuild it for other packages to use the new or changed behavior. Triplit uses [Turbo](https://turbo.build/) to make this process faster and simpler.

For example, if you have a test app that uses `@triplit/client` and you make a change to `@triplit/db`, you'll need to rebuild `@triplit/db` and `@triplit/client` for the test app to use the new behavior. Turbo can build a package and its dependencies with a single command.

```bash
yarn turbo run build --filter=@triplit/client
```

If you want to rebuild continuously as you make changes, you can run

```bash
yarn turbo watch build --filter=@triplit/client
```

You can even continuously build a package's dependencies and dependents with a single command

```bash
yarn turbo watch build --filter=...@triplit/db
```

Read the [Turbo documentation](https://turbo.build/repo/docs/crafting-your-repository/running-tasks#using-filters) for more information.

## Testing

Triplit uses [Vitest](https://vitest.dev/) for unit testing. We strongly encourage that you add tests for whatever you're contributing. If you are expanding the developer-facing API (e.g. `@triplit/client` or bindings for a specific framework) we recommend adding type tests as well. [Here's an example of how we implement type testing.](https://github.com/aspen-cloud/triplit/blob/main/packages/client/test/typecheck/triplit-client/query-builder.test-d.ts)

You can run (and should) run every test in the monorepo from the root with

```bash
yarn test
```

Or you can run the test suite for a specific package from that package's directory

```bash
cd packages/client
yarn test
```

If you want to run a single test file, you can use Vitest directly

```bash
yarn vitest run my-test-file.spec.ts
```

Or run tests in watch mode

```bash
yarn vitest watch
```

Read the [Vitest documentation](https://vitest.dev/guide/) for more information.
