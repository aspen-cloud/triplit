# Type Test Notes

## Running

- The test runner seems to hang if you call `describe` within `describe`
- The setup of your tsconfig is kinda finicky. I have seen cases where you get a false positive run of all tests. At the moment this is why `tsconfig.test.json` is hardcoded.
  - Not including .test-d.ts files in `include`
  - Possibly emitting values causes this (verify)
- if you have broken types in our source code (please dont :)) and you would still like to run type tests, set `ignoreSourceErrors` to `true` in the vitest config.

## Writing Tests

- Prefer using `toEqualTypeOf` over `toMatchTypeOf` since the former is stricter - `toMatchTypeOf` will match any subset of the object
- For object types, `toEqualTypeOf` might be too strict, so `toHaveProperty` is a nice alternative to test properties individually

## TODOs

- Refactor: `QuerySelectionFitleredTypeFromModel` which when trying to merge path and subquery types causes really weird typing in our tests and requires us to use `toMatchTypeOf` instead of `toEqualTypeOf`
