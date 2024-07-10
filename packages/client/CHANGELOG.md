# @triplit/client

## 0.3.68

### Patch Changes

- 20b8bca: Use copy of query when mutating limits during pagination
- Updated dependencies [546bda7]
  - @triplit/db@0.3.52

## 0.3.67

### Patch Changes

- 6914e65: add optional messagePort parameter to WorkerClient constructor

## 0.3.66

### Patch Changes

- Updated dependencies [1b128fb]
  - @triplit/db@0.3.51

## 0.3.65

### Patch Changes

- Updated dependencies [76b3751]
  - @triplit/db@0.3.50

## 0.3.64

### Patch Changes

- Updated dependencies [0e9b4c4]
- Updated dependencies [b68787d]
  - @triplit/db@0.3.49

## 0.3.63

### Patch Changes

- Updated dependencies [fddc883]
  - @triplit/db@0.3.48

## 0.3.62

### Patch Changes

- d7b2190: add `clear` method to client and workerclient

## 0.3.61

### Patch Changes

- Updated dependencies [753a72c]
  - @triplit/db@0.3.47

## 0.3.60

### Patch Changes

- 98a0adf: Improve error logging
- 922d93a: Fix websocket check to be even safer
- Updated dependencies [98a0adf]
- Updated dependencies [7fd83f6]
  - @triplit/db@0.3.46

## 0.3.59

### Patch Changes

- fef88d1: Fix connection status listening when using web worker client

## 0.3.58

### Patch Changes

- 353976a: deprecate RemoteClient and client.remote in favor of HttpClient and client.http
- e531de6: Fixup client query builder types so syncStatus() is always accessible
- Updated dependencies [2c71802]
  - @triplit/db@0.3.45

## 0.3.57

### Patch Changes

- d17db78: Fix connection status tracking in certain environments like Vite

## 0.3.56

### Patch Changes

- 7fac5a4: various types fixes and refactors
- 42c4d0f: Properly unalias Entity helper type
- Updated dependencies [f6468bf]
- Updated dependencies [7fac5a4]
  - @triplit/db@0.3.44

## 0.3.55

### Patch Changes

- 3664595: ts fixes

## 0.3.54

### Patch Changes

- 2c2a4d3: Improve type intellisense readability
- 352b619: refactor fetchById to use fetchOne and simplify params, add id() to builder
- Updated dependencies [2c2a4d3]
- Updated dependencies [352b619]
  - @triplit/db@0.3.43

## 0.3.53

### Patch Changes

- Updated dependencies [3897fc7]
- Updated dependencies [8ccc77e]
  - @triplit/db@0.3.42

## 0.3.52

### Patch Changes

- d890707: hotfix updateGobalVars

## 0.3.51

### Patch Changes

- 19e147e: update query hook types to accept WorkerClient
- Updated dependencies [74500fd]
  - @triplit/db@0.3.41

## 0.3.50

### Patch Changes

- 3f633a1: fix connection status for worker-client
- Updated dependencies [3f633a1]
  - @triplit/db@0.3.40

## 0.3.49

### Patch Changes

- e1bae7b: worker-client improvements

## 0.3.48

### Patch Changes

- c8fadd2: use session variables for token in client db
- Updated dependencies [cae769a]
  - @triplit/db@0.3.39

## 0.3.47

### Patch Changes

- f826e50: Simplify query builder and query generics
- Updated dependencies [f826e50]
  - @triplit/db@0.3.38

## 0.3.46

### Patch Changes

- 5b2e55d: fixup types
- Updated dependencies [5b2e55d]
  - @triplit/db@0.3.37

## 0.3.45

### Patch Changes

- 3202e60: fixup selection types
- Updated dependencies [3202e60]
  - @triplit/db@0.3.36

## 0.3.44

### Patch Changes

- 8d35085: Update fetch return types to reflect query selections
- 87f429a: reexport schema from db
- Updated dependencies [8d35085]
- Updated dependencies [42392cc]
  - @triplit/db@0.3.35

## 0.3.43

### Patch Changes

- 02284c0: Properly type fetchById and ensure returns null if not found

## 0.3.42

### Patch Changes

- Updated dependencies [b3315c3]
  - @triplit/db@0.3.34

## 0.3.41

### Patch Changes

- Updated dependencies [0470537]
- Updated dependencies [8d029fd]
  - @triplit/db@0.3.33

## 0.3.40

### Patch Changes

- 1a8c0ea: Update conflicting type names for @triplit/db Value
- Updated dependencies [5a0f993]
- Updated dependencies [1a8c0ea]
  - @triplit/db@0.3.32

## 0.3.38

### Patch Changes

- Updated dependencies [d1b274b]
  - @triplit/db@0.3.30

## 0.3.37

### Patch Changes

- 826acd1: add shouldWaitForServer helper to useQuery
- 3d08941: make query state correctly adapt to new data

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
