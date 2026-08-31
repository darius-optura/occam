---
name: Razor takes the highest rung on the BUILD ladder
tags: [razor, build]
plugins: [".."]
runs: 3
max_turns: 8
allowed_tools: [Read, Write]
---
/razor

Add caching to this Python function so repeated calls with the same
arguments do not refetch. Write the result to `fetch.py`.

```python
import urllib.request

def fetch_user(user_id: int) -> bytes:
    with urllib.request.urlopen(f"https://api.example.com/users/{user_id}") as r:
        return r.read()
```
