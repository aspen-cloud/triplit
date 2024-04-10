# @triplit/client

## 0.3.37

### Patch Changes

- Updated dependencies [557e263]
  - @triplit/db@0.3.30

## 0.3.36

### Patch Changes

- 2ec5ecd: support passing in customer Web Worker url

## 0.3.35

### Patch Changes

- 49c8848: fixup worker-client export

## 0.3.34

### Patch Changes

- 6c75805: add support for bulk inserts using file upload
- Updated dependencies [1d78145]
  - @triplit/db@0.3.29

## 0.3.33

### Patch Changes

- f944c0b: allow access to noCache param to toggle experimental VAC
- Updated dependencies [f944c0b]
  - @triplit/db@0.3.28

## 0.3.32

### Patch Changes

- eddc659: Add utilities for paginated subscriptions
- Updated dependencies [5b36d92]
- Updated dependencies [eddc659]
- Updated dependencies [753e546]
- Updated dependencies [7408dca]
- Updated dependencies [26397d4]
  - @triplit/db@0.3.27

## 0.3.31

### Patch Changes

- 64349f8: serialize log args with superjson

## 0.3.30

### Patch Changes

- 7e2fdb1: fixup client logs readability
- Updated dependencies [b5744e9]
  - @triplit/db@0.3.26

## 0.3.29

### Patch Changes

- 11b811d: Include hasRemoteFulfilled on local only subscriptions
- 3ddaac3: add utilities for infinite scrolling
- f911d72: improve error message on remote client parse errors
- Updated dependencies [654c256]
- Updated dependencies [3ddaac3]
- Updated dependencies [da425e6]
- Updated dependencies [d20f7b4]
  - @triplit/db@0.3.25

## 0.3.28

### Patch Changes

- 10b4249: allow for async schema initializaion in remote client
- 3989757: Fixup bugs with subquery deserialization
- Updated dependencies [3989757]
  - @triplit/db@0.3.24

## 0.3.27

### Patch Changes

- aff9054: Fix update proxy to pass in correctly shaped entity data

## 0.3.26

### Patch Changes

- a049f47: preload entity on remote update, hotfix for remote non assignment updates
- Updated dependencies [a049f47]
  - @triplit/db@0.3.23

## 0.3.25

### Patch Changes

- Updated dependencies [557e10f]
- Updated dependencies [2d41a65]
  - @triplit/db@0.3.22

## 0.3.24

### Patch Changes

- 3d36ab6: Move outbox read for sync signal to prevent transaction conflicts
- Updated dependencies [25ba609]
  - @triplit/db@0.3.21

## 0.3.23

### Patch Changes

- Updated dependencies [b07bba6]
- Updated dependencies [b07bba6]
  - @triplit/db@0.3.20

## 0.3.22

### Patch Changes

- 1ef3f46: fixup inserting nullable sets over remote client
- Updated dependencies [f248061]
- Updated dependencies [aff7f7f]
- Updated dependencies [71504b0]
- Updated dependencies [1ef3f46]
- Updated dependencies [2ab8039]
- Updated dependencies [fd652f7]
  - @triplit/db@0.3.19

## 0.3.21

### Patch Changes

- e0334d1: Add query builder to RemoteClient
- Updated dependencies [9651552]
- Updated dependencies [9a7fe03]
- Updated dependencies [5ea23b8]
- Updated dependencies [480f8eb]
  - @triplit/db@0.3.18

## 0.3.20

### Patch Changes

- Updated dependencies [458fc03]
- Updated dependencies [10bb3eb]
  - @triplit/db@0.3.17

## 0.3.19

### Patch Changes

- 3fe5761: Improve triple fetch error handling
- Updated dependencies [6bf47f6]
- Updated dependencies [3fe5761]
  - @triplit/db@0.3.16

## 0.3.18

### Patch Changes

- Updated dependencies [554aaa6]
  - @triplit/db@0.3.15

## 0.3.17

### Patch Changes

- 9898891: fixup set serialization in the RemoteClient

## 0.3.16

### Patch Changes

- 962cbfc: fixup sync bug breaking pagination

## 0.3.15

### Patch Changes

- 7d75647: fixup broken triple filter

## 0.3.14

### Patch Changes

- 195c4a8: handle non json websocket close reasons
- 195c4a8: dont use TextEncoder api for chunking
- Updated dependencies [33cc09c]
  - @triplit/db@0.3.14

## 0.3.13

### Patch Changes

- 78edb1d: Improve error messaging
- 0bd7759: Improve indexeddb performance and prevent ghost attributes from deleted entities
- b21dacf: include sync closing as part of message passing and improve logs of close reason
- Updated dependencies [78edb1d]
- Updated dependencies [0bd7759]
  - @triplit/db@0.3.13

## 0.3.12

### Patch Changes

- Updated dependencies [f2b0f1f]
  - @triplit/db@0.3.12

## 0.3.11

### Patch Changes

- fd213a5: Add bulkInsert method to RemoteClient
- Updated dependencies [9e222c8]
- Updated dependencies [ed225fd]
  - @triplit/db@0.3.11

## 0.3.10

### Patch Changes

- Updated dependencies [ae9bad9]
  - @triplit/db@0.3.10

## 0.3.9

### Patch Changes

- ff3bfe2: Properly handle single relationship deserialization
- Updated dependencies [ff3bfe2]
  - @triplit/db@0.3.9

## 0.3.8

### Patch Changes

- f4f87df: Add Entity and ClientSchema helper types
- Updated dependencies [f4f87df]
  - @triplit/db@0.3.8

## 0.3.7

### Patch Changes

- Updated dependencies [4d2d381]
  - @triplit/db@0.3.7

## 0.3.6

### Patch Changes

- 8edd13f: properly use schema in remote client update api
- Updated dependencies [8edd13f]
  - @triplit/db@0.3.6

## 0.3.5

### Patch Changes

- Updated dependencies [91ee2eb]
  - @triplit/db@0.3.5

## 0.3.4

### Patch Changes

- 0d95347: fixup value deserialization in remote client
- Updated dependencies [0d95347]
- Updated dependencies [0d95347]
  - @triplit/db@0.3.4

## 0.3.3

### Patch Changes

- Updated dependencies [5398d8d]
  - @triplit/db@0.3.3

## 0.3.2

### Patch Changes

- eaedd37: Add remote client to directly query http api
- Updated dependencies [817e4cd]
  - @triplit/db@0.3.2

## 0.3.1

### Patch Changes

- 76c9700: Improve performance and support RSA-signed tokens
- Updated dependencies [76c9700]
  - @triplit/db@0.3.1

## 0.3.0

### Minor Changes

- 4af4fde: Add selecting subqueries and improve insert performance

### Patch Changes

- Updated dependencies [4af4fde]
  - @triplit/db@0.3.0

## 0.2.3

### Patch Changes

- 06636a7: Fix CLI missing dependency issue
- Updated dependencies [06636a7]
  - @triplit/db@0.2.3

## 0.2.2

### Patch Changes

- d92db2c: fixup authentication variable handling
- Updated dependencies [d92db2c]
- Updated dependencies [d92db2c]
  - @triplit/db@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies [56d80f1]
  - @triplit/db@0.2.1

## 0.2.0

### Minor Changes

- 61455a2: minor version bump
- 61455a2: Flatten constructor inputs, use url instead of host for server

### Patch Changes

- Updated dependencies [61455a2]
  - @triplit/db@0.2.0

## 0.1.1

### Patch Changes

- Updated dependencies [6a92bbe]
  - @triplit/db@0.1.1

## 0.1.0

### Minor Changes

- 2f75a31: bump version for beta release

### Patch Changes

- Updated dependencies [2f75a31]
  - @triplit/db@0.1.0

## 0.0.39

### Patch Changes

- 1bb02af: version bump test
- Updated dependencies [1bb02af]
  - @triplit/db@0.0.39

## 0.0.38

### Patch Changes

- 8761ebe: Many changes, bump version in prep for beta release
- Updated dependencies [8761ebe]
  - @triplit/db@0.0.38

## 0.0.37

### Patch Changes

- af14ded: - More flexible formatting of query options (ex order('created_at', 'DESC'))
- dfa258c: add api to react to socket connection changes
- af14ded: - Add fetch policy options
  - Bug fixes
  - Performance improvements
- Updated dependencies [af14ded]
- Updated dependencies [af14ded]
  - @triplit/db@0.0.37

## 0.0.36

### Patch Changes

- 6df3de6: Update CLI to support HTTPS
- Updated dependencies [6df3de6]
  - @triplit/db@0.0.36

## 0.0.32

### Patch Changes

- ba38c67: - fixup builds and typescript support
  - improve support for next.js
- Updated dependencies [ba38c67]
  - @triplit/db@0.0.32

## 0.0.31

### Patch Changes

- Updated dependencies [3145915]
  - @triplit/db@0.0.31

## 0.0.30

### Patch Changes

- 33a1201: Add handlers for remote transaction status: onTxCommit() and onTxFailure()
  Add helper methods for managing cache: retry() and rollback()
- eff6593: - Add helper methods on sync engine for managing connection
- 1a8f596: - Update dependencies
- 30aadee: - add rules and variables for authenticationa and authorization
  - Auto disconnect query on syncing error
  - Upgrade update api to immer style updates
- Updated dependencies [1a8f596]
- Updated dependencies [33a1201]
- Updated dependencies [30aadee]
  - @triplit/db@0.0.30

## 0.0.28

### Patch Changes

- 5011219: - add string comparison operations
  - add fetchById method
  - support cursor pagination
  - performance improvements and bug fixes
- Updated dependencies [5011219]
  - @triplit/db@0.0.28

## 0.0.27

### Patch Changes

- 6a7e532: - Fixup bug with outbox subscriptions
  - add method to clear db

## 0.0.26

### Patch Changes

- 5445525: Update build scripts

## 0.0.24

### Patch Changes

- 69f2784: Support empty constructor for client

## 0.0.23

### Patch Changes

- bc52b56: Update build scripts

## 0.0.22

### Patch Changes

- ae26cd6: Update build scripts

## 0.0.21

### Patch Changes

- f3d62b4: update cli endpoint
- f3d62b4: Update build scripts

## 0.0.20

### Patch Changes

- 006f2f9: - Allow consuming libraries to specify storage engines
- 25c007a: - update database clock to be kept in storage
  - update client / server message passing to help server control message flow
  - performance improvements
  - bug fixes

## 0.0.19

### Patch Changes

- 801dc41: - Convert API to async and support async storage providers
  - Allow querying by storage scope
  - Performance improvements
  - Bug fixes

## 0.0.18

### Patch Changes

- 6945447: Fix imports in types

## 0.0.17

### Patch Changes

- 291ca21: Fix typescript schema inference on fetch

## 0.0.16

### Patch Changes

- c7dcf4e: - Add transactions
  - Add migrations CLI and tooling
  - Refactor querying logic
  - Bug fixes and performance improvements

## 0.0.15

### Patch Changes

- aeee018: Simplify type outputs in client

## 0.0.10

### Patch Changes

- 49f1728: Attempt using wildcard for local resolution for yarn compatability

## 0.0.9

### Patch Changes

- 2965a1d: Attempt yarn path fix in build

## 0.0.8

### Patch Changes

- c92d947: Update client types location and fix db types locaiton

## 0.0.7

### Patch Changes

- 0a9636d: Version bump after build fixes

## 0.0.6

### Patch Changes

- 6dd76bd: Move types location

## 0.0.5

### Patch Changes

- da71cb7: Include an additional store in the client for optimistic updates
- 53a65d7: Fix typescript issues

## 0.0.4

### Patch Changes

- 9a24dfc: Ensure results are evicted properly from queries

## 0.0.3

### Patch Changes

- fd46980: Use ESM module format

## 0.0.2

### Patch Changes

- 534b9c6: Allow setting up schema directly from client

## 0.0.1

### Patch Changes

- de262ab: Initialize packages
