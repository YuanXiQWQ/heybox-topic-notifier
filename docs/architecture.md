# Architecture Notes

## Runtime Goal

The production target is cloud-first:

- The main Deno service must keep running when the user's local computer is off.
- Local LDPlayer or ADB automation is only a development and verification path.
- The project should prefer free or no-cost hosting paths.

## Topic Sources

The app uses a replaceable `TopicSource` boundary:

- `mock`: local demo data.
- `heybox`: direct Heybox web/API request path. This is useful for diagnostics, but publish-time
  sorting is not reliable because the server can fall back to smart sorting.
- `heybox-hblog`: local development path that parses an already exported Xiaoheihe App hblog net
  log. It proves that App-side `sort_filter=create` responses can be parsed, but it is not the final
  cloud deployment model.
- `worker`: cloud-facing source. The main service calls a feed worker over HTTP and receives
  normalized posts.

## Worker Contract

When `TOPIC_SOURCE=worker`, the main service sends:

```text
GET {TOPIC_WORKER_URL}?topic_id={topic_id}&limit={limit}&sort={publishTime|smart|replyTime}
Authorization: Bearer {TOPIC_WORKER_TOKEN}
```

The worker returns:

```json
{
  "posts": [
    {
      "id": "post-id",
      "publishedAt": "2026-07-02T17:25:34.000Z",
      "title": "post title",
      "excerpt": "short text",
      "body": "full text",
      "comments": [],
      "commentReplies": [],
      "url": "https://example.test/post"
    }
  ]
}
```

The worker is responsible for proving that `publishTime` data really comes from the App-side
publish-time feed, not from smart-sort results locally reordered by timestamp.

## Free-Channel Constraint

The likely free split is:

- Deno Deploy or another free edge/serverless tier for the main service.
- A separate worker candidate that can be swapped in later.

Long-running cloud Android emulators usually need paid or fragile infrastructure. GitHub Actions can
run scheduled jobs and Android emulators for experiments, but it should be treated as a worker
candidate to validate rather than assumed as a stable always-on Android host.
