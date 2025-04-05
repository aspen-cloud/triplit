# @triplit/client

## 1.0.18

### Patch Changes

- Updated dependencies [caa6b418]
  - @triplit/db@1.0.17

## 1.0.17

### Patch Changes

- 23f52af2: Allow connection attempt to flow through even if no token to ensure logs inform user of state
- a4a9c4ec: move client to use @triplit/logger
- Updated dependencies [a4a9c4ec]
  - @triplit/logger@0.0.3
  - @triplit/db@1.0.16

## 1.0.16

### Patch Changes

- Updated dependencies [74736c3f]
  - @triplit/db@1.0.15

## 1.0.15

### Patch Changes

- Updated dependencies [69c8efe7]
  - @triplit/db@1.0.14

## 1.0.14

### Patch Changes

- Updated dependencies [ee4dc5c1]
  - @triplit/logger@0.0.2
  - @triplit/db@1.0.13

## 1.0.13

### Patch Changes

- Updated dependencies [5fea17c0]
  - @triplit/db@1.0.12

## 1.0.12

### Patch Changes

- ad6618dd: separate out client transport exports
- Updated dependencies [b37e241f]
  - @triplit/db@1.0.11

## 1.0.11

### Patch Changes

- e9395371: add a few more specific return types
- Updated dependencies [e9395371]
  - @triplit/db@1.0.10

## 1.0.10

### Patch Changes

- Updated dependencies [0f8a4a4a]
- Updated dependencies [a7c98bcd]
  - @triplit/db@1.0.9

## 1.0.9

### Patch Changes

- Updated dependencies [c4cdb1ec]
- Updated dependencies [0e9ae548]
  - @triplit/db@1.0.8

## 1.0.8

### Patch Changes

- Updated dependencies [1891580f]
  - @triplit/db@1.0.7

## 1.0.7

### Patch Changes

- Updated dependencies [a5b5c5fe]
- Updated dependencies [017b22bb]
  - @triplit/db@1.0.6

## 1.0.6

### Patch Changes

- 431fb8d4: Add sourcemaps to db and client
- Updated dependencies [4005a4bf]
- Updated dependencies [431fb8d4]
  - @triplit/db@1.0.5

## 1.0.5

### Patch Changes

- a6ceef0b: update http response parsing

## 1.0.4

### Patch Changes

- 9e7be963: WorkerClient fixups
- Updated dependencies [f6fecc85]
  - @triplit/db@1.0.4

## 1.0.3

### Patch Changes

- 4fe2bc9c: git commit -m "remove deprecated apis"
- eb08f761: properly pass schema to http client
- 593238e5: add onFailureToSyncWrites callback
- Updated dependencies [eb08f761]
- Updated dependencies [bc014aa3]
  - @triplit/db@1.0.3

## 1.0.2

### Patch Changes

- Updated dependencies [88df6b96]
- Updated dependencies [b19cbb14]
  - @triplit/db@1.0.2

## 1.0.1

### Patch Changes

- Updated dependencies [05053ede]
  - @triplit/logger@0.0.1
  - @triplit/db@1.0.1

## 1.0.0

### Major Changes

- aa25e64d: Triplit 1.0

### Patch Changes

- 70ea2813: more gracefully handle starting session when one is already active
- Updated dependencies [44f9ed5b]
  - @triplit/db@1.0.0

## 0.6.14

### Patch Changes

- Updated dependencies [dcc536dc]
  - @triplit/db@0.5.21

## 0.6.13

### Patch Changes

- Updated dependencies [4ef05ec3]
  - @triplit/db@0.5.20

## 0.6.12

### Patch Changes

- Updated dependencies [6d348d3d]
  - @triplit/db@0.5.19

## 0.6.11

### Patch Changes

- Updated dependencies [398da292]
  - @triplit/db@0.5.18

## 0.6.10

### Patch Changes

- Updated dependencies [a80dbe04]
  - @triplit/db@0.5.17

## 0.6.9

### Patch Changes

- 4ccc6422: upgrade @sinclair/typebox
- Updated dependencies [4ccc6422]
  - @triplit/db@0.5.16

## 0.6.8

### Patch Changes

- Updated dependencies [f3186500]
- Updated dependencies [e5ff046f]
  - @triplit/db@0.5.15

## 0.6.7

### Patch Changes

- Updated dependencies [b2b3eae5]
  - @triplit/db@0.5.14

## 0.6.6

### Patch Changes

- Updated dependencies [7bbc8e53]
  - @triplit/db@0.5.13

## 0.6.5

### Patch Changes

- Updated dependencies [bb973df7]
  - @triplit/db@0.5.12

## 0.6.4

### Patch Changes

- 6de9aaf4: add ability to custom name storages without providing instances

## 0.6.3

### Patch Changes

- 483c84b6: fix refresh interval

## 0.6.2

### Patch Changes

- 2541c6e2: various fixups for the sessions API
- Updated dependencies [8e9511dc]
- Updated dependencies [a2532548]
  - @triplit/db@0.5.11

## 0.6.1

### Patch Changes

- Updated dependencies [a0932216]
  - @triplit/db@0.5.10

## 0.6.0

### Minor Changes

- 2713ca43: Implement new sessions API

### Patch Changes

- Updated dependencies [2713ca43]
  - @triplit/db@0.5.9

## 0.5.17

### Patch Changes

- f1ce9675: Prevent possible error in client subscription race condition
- Updated dependencies [bdebed22]
- Updated dependencies [7b1839b6]
  - @triplit/db@0.5.8

## 0.5.16

### Patch Changes

- Updated dependencies [9107e262]
- Updated dependencies [0cc53c85]
- Updated dependencies [cb785390]
  - @triplit/db@0.5.7

## 0.5.15

### Patch Changes

- Updated dependencies [dd8278d1]
  - @triplit/db@0.5.6

## 0.5.14

### Patch Changes

- Updated dependencies [8f004df6]
  - @triplit/db@0.5.5

## 0.5.13

### Patch Changes

- bdd50e7f: Fixup worker client subscribeBackground

## 0.5.12

### Patch Changes

- Updated dependencies [e9eb5c26]
  - @triplit/db@0.5.4

## 0.5.11

### Patch Changes

- 8c97bfdb: Add experimental entity cache
- 57d1e24b: Add onFulfilled to background subscription
- Updated dependencies [f201dd5a]
- Updated dependencies [8c97bfdb]
  - @triplit/db@0.5.3

## 0.5.10

### Patch Changes

- 3d5e879d: Pass remote sync errors to subscription error handlers
- Updated dependencies [aca9cf75]
- Updated dependencies [3d5e879d]
  - @triplit/db@0.5.2

## 0.5.9

### Patch Changes

- @triplit/db@0.5.1

## 0.5.8

### Patch Changes

- ccfa038c: Add method subscribeBackground() for sync in background
- Updated dependencies [3984bc94]
- Updated dependencies [94417d39]
  - @triplit/db@0.5.0

## 0.5.7

### Patch Changes

- Updated dependencies [15815dc2]
- Updated dependencies [23b6171d]
  - @triplit/db@0.4.6

## 0.5.6

### Patch Changes

- 3ca5265f: Fix query syncin race condition that occured with React Strict mode's double rendering behavior

## 0.5.5

### Patch Changes

- 16687b5a: Fix race condition with rapid query disconnects
- c9fde067: fixup bug causing duplicate query tracking when syncStatus is assigned
- Updated dependencies [c9fde067]
  - @triplit/db@0.4.5

## 0.5.4

### Patch Changes

- Updated dependencies [f7ab3c65]
  - @triplit/db@0.4.4

## 0.5.3

### Patch Changes

- Updated dependencies [80a1d44b]
  - @triplit/db@0.4.3

## 0.5.2

### Patch Changes

- 3feda93e: export all client types
- Updated dependencies [c0365bd9]
- Updated dependencies [5305bc0f]
  - @triplit/db@0.4.2

## 0.5.1

### Patch Changes

- 761648cf: Properly handle optional props in Entity type, add type EntityWithSelection for including a selection or inclusion with Entity
- Updated dependencies [8966b0fe]
- Updated dependencies [761648cf]
  - @triplit/db@0.4.1

## 0.5.0

### Minor Changes

- 0a09013b: Sunset migrations API
- f894e435: update query return type to array
- abe8bea8: Sunset client.remote, RemoteClient, server config param
- 38746526: Add reset API for full state resets of client, updateToken and updateOptions do not automatically reconnect anymore
- abe8bea8: Sunset entityId() in builder

### Patch Changes

- Updated dependencies [0a09013b]
- Updated dependencies [38746526]
- Updated dependencies [f894e435]
- Updated dependencies [abe8bea8]
  - @triplit/db@0.4.0

## 0.4.13

### Patch Changes

- 3c7fd004: Add WorkerInternalClient class for reuse inside Workers
- Updated dependencies [5fed7f42]
  - @triplit/db@0.3.75

## 0.4.12

### Patch Changes

- Updated dependencies [5eae93dc]
  - @triplit/db@0.3.74

## 0.4.11

### Patch Changes

- Updated dependencies [99a5b854]
  - @triplit/db@0.3.73

## 0.4.10

### Patch Changes

- @triplit/db@0.3.72

## 0.4.9

### Patch Changes

- a902f8b8: unify session variable transformation logic
- Updated dependencies [4f99c558]
- Updated dependencies [a902f8b8]
  - @triplit/db@0.3.71

## 0.4.8

### Patch Changes

- 7ea2a0a9: dedupe queries in sync engine

## 0.4.7

### Patch Changes

- b5374280: Update client types
- 22b3e245: add getSchema methods to WorkerClient
- Updated dependencies [104027d8]
- Updated dependencies [833b69c9]
- Updated dependencies [ecc5a959]
  - @triplit/db@0.3.70

## 0.4.6

### Patch Changes

- d11d57e2: Use async generators for tuple scans rather than arrays for lazy pagination of indexes that will reduce memory and increase performance on large datasets
- Updated dependencies [96d4d8ff]
- Updated dependencies [d11d57e2]
- Updated dependencies [ffb00f68]
  - @triplit/db@0.3.69

## 0.4.5

### Patch Changes

- 51cde34e: fix bug where updating token wouldn't add session vars
- Updated dependencies [79df5162]
  - @triplit/db@0.3.68

## 0.4.4

### Patch Changes

- e6e07458: export QueryResult type helper

## 0.4.3

### Patch Changes

- Updated dependencies [38bdff77]
  - @triplit/db@0.3.67

## 0.4.2

### Patch Changes

- bbc64ede: Extend Entity type to include selection and inclusions
- 12650423: Fix update method not working with WorkerClient
- bbc64ede: Add helper type for QueryResult
- Updated dependencies [73d638ec]
  - @triplit/db@0.3.66

## 0.4.1

### Patch Changes

- 0139e1a4: Improve support for nested queries and results, add subquery to query builder"
- Updated dependencies [28d32b51]
- Updated dependencies [0139e1a4]
  - @triplit/db@0.3.65

## 0.4.0

### Minor Changes

- f9470ad1: Add basic support for syncing server with an upstream server

### Patch Changes

- ba9f0d6c: more intelligently initialize workerClient connecting state
- 6d249ce2: throw when browser APIs invoked but not available

## 0.3.84

### Patch Changes

- 9857d9de: prettify HttpClient inputs and outputs

## 0.3.83

### Patch Changes

- bb7c67ab: pass full token to client session
- d3f0ea94: use Worker if SharedWorker not available in WorkerClient

## 0.3.82

### Patch Changes

- Updated dependencies [c8c955a5]
  - @triplit/db@0.3.64

## 0.3.81

### Patch Changes

- Updated dependencies [48bdee2]
  - @triplit/db@0.3.63

## 0.3.80

### Patch Changes

- 40e2e50: add transaction option manualSchemaRefresh
- Updated dependencies [40e2e50]
  - @triplit/db@0.3.62

## 0.3.79

### Patch Changes

- 1c0bdf7: Fixup transaction types
- Updated dependencies [c78aa65]
- Updated dependencies [6ccbbd5]
  - @triplit/db@0.3.61

## 0.3.78

### Patch Changes

- Updated dependencies [41692f0]
  - @triplit/db@0.3.60

## 0.3.77

### Patch Changes

- Updated dependencies [7c5105d]
- Updated dependencies [6c24a2c]
  - @triplit/db@0.3.59

## 0.3.76

### Patch Changes

- Updated dependencies [aa9e562]
- Updated dependencies [2decc7f]
  - @triplit/db@0.3.58

## 0.3.75

### Patch Changes

- f636418: add serverUrl option to HttpClient

## 0.3.74

### Patch Changes

- 5353395: Redirect logs from SharedWorker to console in tab
- eb66825: Properly type worker client .transact()
- Updated dependencies [eb66825]
  - @triplit/db@0.3.57

## 0.3.73

### Patch Changes

- c3fb0be: Fix executing update callbacks in transaction in worker
- Updated dependencies [c3fb0be]
  - @triplit/db@0.3.56

## 0.3.72

### Patch Changes

- 607e020: Export Roles type

## 0.3.71

### Patch Changes

- Updated dependencies [b65160e]
  - @triplit/db@0.3.55

## 0.3.70

### Patch Changes

- 2d2b360: add JSDoc comments
- Updated dependencies [55ae69b]
- Updated dependencies [a8c6f75]
  - @triplit/db@0.3.54

## 0.3.69

### Patch Changes

- 199684b: ensure query builder can be built incrementally without overwritinga
- Updated dependencies [784b82f]
- Updated dependencies [199684b]
  - @triplit/db@0.3.53

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
