# Privacy Policy — LinkedIn Blocker

**Last updated:** 2026-06-13

LinkedIn Blocker is a Chrome extension that detects and hides AI-generated posts in your LinkedIn feed. This policy explains what data the extension stores, where it is stored, and how you can delete it.

---

## What data is stored

All data is stored **locally on your device** using `chrome.storage.local`. Nothing is transmitted to any server unless you explicitly enable the optional AI-powered detection feature described below.

| Data | Purpose | Stored where |
|------|---------|-------------|
| Flagged account records (profile ID, name, URL, detection scores, signal breakdown) | Powers the popup review queue | `chrome.storage.local` |
| Stored post text (up to 1000 characters per post, max 200 posts) | Lets you review what was hidden | `chrome.storage.local` |
| Daily statistics (post counts, unique author IDs seen per day) | Powers the dashboard feed-health stats | `chrome.storage.local` |
| Dismissed account IDs | Prevents re-flagging accounts you've cleared | `chrome.storage.local` |
| Anthropic API key (optional) | Required only for the optional AI-powered detection mode | `chrome.storage.local` |

---

## LinkedIn data access

The extension reads your LinkedIn feed page (`linkedin.com`) to extract post text and author information for local scoring. It does **not** access your LinkedIn account credentials, messages, connections, or profile settings.

---

## Optional AI-powered detection (opt-in)

By default the extension uses only local heuristic rules — **no data leaves your device**.

If you choose to enable AI-powered detection, you must manually set an Anthropic API key by running the following command in Chrome DevTools:

```
chrome.storage.local.set({ anthropicApiKey: 'sk-ant-...' })
```

When an API key is set, post text is sent to **Anthropic's API** (`api.anthropic.com`) for analysis. This data is subject to [Anthropic's Privacy Policy](https://www.anthropic.com/privacy). You can remove the key at any time with:

```
chrome.storage.local.remove('anthropicApiKey')
```

### Automatic selector repair (self-healing)

LinkedIn frequently changes its page structure, which can break the extension's ability to find posts. When the extension detects that it can no longer locate any posts on an active feed, it first tries to repair itself locally with no network access. If that fails **and** you have set an Anthropic API key, it may send a **sanitized structural description of the feed layout** to Anthropic's API (`api.anthropic.com`) to help re-derive a working selector.

This structural skeleton contains **only** HTML tag names, `data-*`/`role` attributes, and element nesting. All post text, author names, headlines, profile links (`href`), image URLs (`src`), and accessibility labels (`aria-label`) are **stripped before the request is sent** — **no post content or personally identifiable information leaves your browser** during selector repair. These repair calls are strictly rate-limited (at most a few per day) and never happen without an API key configured.

---

## How to delete your data

### From the dashboard

Open the extension dashboard (click the extension icon → ⚙ Settings → View Dashboard, or navigate to the extension's options page). Use the **"Cleanse data before"** date control to remove records older than a chosen date, or set the date to tomorrow to remove everything.

### By uninstalling

Uninstalling the extension from Chrome removes all `chrome.storage.local` data automatically.

---

## Third-party services

| Service | When used | Policy |
|---------|-----------|--------|
| Anthropic API (`api.anthropic.com`) | Only when user has set an API key (opt-in) | [anthropic.com/privacy](https://www.anthropic.com/privacy) |

No analytics, crash reporting, or advertising services are used.

---

## Changes to this policy

If the data practices change in a future version, this file will be updated and the **Last updated** date will change. The policy is versioned alongside the extension source code on GitHub.

---

## Contact

This extension is open-source. Questions or concerns can be raised via [GitHub Issues](https://github.com/ed-is-ai/linkedinaivoiceblock/issues).
