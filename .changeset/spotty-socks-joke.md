---
'@triplit/server-core': patch
'@triplit/client': patch
'@triplit/db': patch
---

Use async generators for tuple scans rather than arrays for lazy pagination of indexes that will reduce memory and increase performance on large datasets
