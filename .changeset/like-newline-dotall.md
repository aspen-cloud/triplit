---
'@triplit/db': patch
---

Fix `like`/`nlike` so the `%` and `_` wildcards match newline characters, matching SQL LIKE semantics. Previously the pattern was compiled to a regular expression without the dotall flag, so a value containing a newline would not match patterns it should (e.g. `'a\nb'` did not match `'a%b'` or `'a_b'`, and `'%'` failed to match any multi-line value).
