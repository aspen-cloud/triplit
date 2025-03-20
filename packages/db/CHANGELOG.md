# @triplit/entity-db

## 1.0.12

### Patch Changes

- 5fea17c0: Rm console logs

## 1.0.11

### Patch Changes

- b37e241f: simplify order and include clauses with subqueries

## 1.0.10

### Patch Changes

- e9395371: add a few more specific return types

## 1.0.9

### Patch Changes

- 0f8a4a4a: simplify subquery filters during preparation
- a7c98bcd: Fix nested relational filters in fitler groups like AND and OR (usually in permissions) failing in subscriptions

## 1.0.8

### Patch Changes

- c4cdb1ec: fixup relational variable filter paths starting from $0
- 0e9ae548: handle subquery filters in OR groups in write permissions

## 1.0.7

### Patch Changes

- 1891580f: Use explicit file extensions for core-js polyfills

## 1.0.6

### Patch Changes

- a5b5c5fe: Add core-js polyfills
- 017b22bb: Add S.Filter helper to aid with multi-file permission building

## 1.0.5

### Patch Changes

- 4005a4bf: validate that collection property and relationship names dont match
- 431fb8d4: Add sourcemaps to db and client

## 1.0.4

### Patch Changes

- f6fecc85: make VAC more aware of set filters and non VAC friendly operators

## 1.0.3

### Patch Changes

- eb08f761: tweak role equivalency check to allow relax definition of no roles
- bc014aa3: add Subquery apis inside relation builder

## 1.0.2

### Patch Changes

- 88df6b96: fixup query builder where and order types inside relation builder
- b19cbb14: tweak vac error message

## 1.0.1

### Patch Changes

- Updated dependencies [05053ede]
  - @triplit/logger@0.0.1

## 1.0.0

### Major Changes

- 44f9ed5b: Triplit 1.0

## 0.0.1-canary-20250310223455

### Patch Changes

- 73d65924: Bump version

## 0.0.1-canary-20250308203743

### Patch Changes

- 652b6d1d: refactor types and deps

## 0.0.1-canary-20250306235641

### Patch Changes

- 35f3cd67: try more compatible version of setImmediate
- 04e9b7ae: update tx return type

## 0.0.1-canary-20250306191454

### Patch Changes

- 02bddcd3: bump version

## 0.0.1-canary-20250225192824

### Patch Changes

- @triplit/db@0.6.0-canary-20250225192824

## 0.0.1-canary-20250225002127

### Patch Changes

- @triplit/db@0.6.0-canary-20250225002127

## 0.0.1-canary-20250224214952

### Patch Changes

- @triplit/db@0.6.0-canary-20250224214952

## 0.0.1-canary-20250224192505

### Patch Changes

- @triplit/db@0.6.0-canary-20250224192505

## 0.0.1-canary-20250221232228

### Patch Changes

- @triplit/db@0.6.0-canary-20250221232228

## 0.0.1-canary-20250218050211

### Patch Changes

- 5c8e0c1c: sqlite safely handle busy statements
- Updated dependencies [98ea28f1]
  - @triplit/db@0.6.0-canary-20250218050211

## 0.0.1-canary-20250217185840

### Patch Changes

- Updated dependencies [b8a2b5c4]
  - @triplit/logger@0.0.1-canary-20250217185840

## 0.0.1-canary-20250217180655

### Patch Changes

- b03b1b93: ivm bug fixes

## 0.0.1-canary-20250207224403

### Patch Changes

- de5ea7a7: apply permissions properly to subscribeChanges

## 0.0.1-canary-20250206062549

### Patch Changes

- 12daf65d: add limit to vac path

## 0.0.1-canary-20250205191258

### Patch Changes

- c6add210: Ensure VAC returns entity copies

## 0.0.1-canary-20250204212628

### Patch Changes

- c78894e9: async fixups

## 0.0.1-canary-20250204182912

### Patch Changes

- 41d53144: kv fixups

## 0.0.1-canary-20250204165459

### Patch Changes

- d09b8391: move storage dependencies out of main package

## 0.0.1-canary-20250204062109

### Patch Changes

- @triplit/db@0.6.0-canary-20250204062109

## 0.0.1-canary-20250204060424

### Patch Changes

- @triplit/db@0.6.0-canary-20250204060424

## 0.0.1-canary-20250204055631

### Patch Changes

- @triplit/db@0.6.0-canary-20250204055631

## 0.0.1-canary-20250204042452

### Patch Changes

- @triplit/db@0.6.0-canary-20250204042452

## 0.0.1-canary-20250204035012

### Patch Changes

- @triplit/db@0.6.0-canary-20250204035012

## 0.0.1-canary-20250204025207

### Patch Changes

- 613f6e5c: initial release
- Updated dependencies [4866105f]
  - @triplit/db@0.6.0-canary-20250204025207
