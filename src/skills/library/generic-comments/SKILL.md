---
name: generic-comments-signal
description: "Async signal that fetches post comments and scores by generic-comment density. The only sync:false skill in the registry — requires fetchComments context. The score>20 gate is enforced by the runner, not this skill. Wraps checkGenericComments() from the underlying signals module."
metadata:
  kind: signal
---
