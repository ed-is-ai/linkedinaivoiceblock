---
name: hook-story-signal
description: "Scores posts that open with a hook-story pattern ('I was Xing when...' opener form). Wraps checkHookStory() from the underlying signals module. The regex requires 'I was \\w+ing' form to avoid false positives. Weights live in the underlying function, not redeclared here."
metadata:
  kind: signal
---
