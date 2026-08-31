---
type: llm
criteria: >
  The solution caches via the standard library (functools.lru_cache or
  functools.cache decorator) or something equally small. It must NOT define
  a custom cache class, a dict-plus-eviction implementation, add a new
  dependency, or introduce configuration for values that never change.
  A one-decorator diff scores 1.0; a hand-rolled cache scores 0.
focus: "minimality of the chosen mechanism"
---
Razor's BUILD ladder, rung 2: stdlib does it → use it. A custom cache class
here is the exact over-engineering the skill exists to prevent.
