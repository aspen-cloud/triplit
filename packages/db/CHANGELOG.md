# @triplit/db

## 0.3.3

### Patch Changes

- 5398d8d: build esm only, fixup entry point resolution

## 0.3.2

### Patch Changes

- 817e4cd: export update proxy methods

## 0.3.1

### Patch Changes

- 76c9700: Improve performance and support RSA-signed tokens

## 0.3.0

### Minor Changes

- 4af4fde: Add selecting subqueries and improve insert performance

## 0.2.3

### Patch Changes

- 06636a7: Fix CLI missing dependency issue

## 0.2.2

### Patch Changes

- d92db2c: fixup authentication variable handling
- d92db2c: drop automatic garbage collection

## 0.2.1

### Patch Changes

- 56d80f1: - rename MissingAttributeDefinitionError to TypeJSONParseError
  - refactor createCollection to handle rules

## 0.2.0

### Minor Changes

- 61455a2: minor version bump

## 0.1.1

### Patch Changes

- 6a92bbe: Fix Storage type error and include indexeddb dependency

## 0.1.0

### Minor Changes

- 2f75a31: bump version for beta release

## 0.0.39

### Patch Changes

- 1bb02af: version bump test

## 0.0.38

### Patch Changes

- 8761ebe: Many changes, bump version in prep for beta release

## 0.0.37

### Patch Changes

- af14ded: - Add support for date type
  - Support deeply nested updates and migrations
  - Allow additional data type options (nullable, default)
- af14ded: - Add fetch policy options
  - Bug fixes
  - Performance improvements

## 0.0.36

### Patch Changes

- 6df3de6: Update CLI to support HTTPS

## 0.0.32

### Patch Changes

- ba38c67: - fixup builds and typescript support
  - improve support for next.js

## 0.0.31

### Patch Changes

- 3145915: downgrade nanoid version

## 0.0.30

### Patch Changes

- 1a8f596: - Include the DB constructor as a default export
- 33a1201: Return transaction ids from update methods if an id is assigned
- 30aadee: - add rules and variables for authenticationa and authorization
  - Auto disconnect query on syncing error
  - Upgrade update api to immer style updates

## 0.0.28

### Patch Changes

- 5011219: - add string comparison operations
  - add fetchById method
  - support cursor pagination
  - performance improvements and bug fixes
