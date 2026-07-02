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

`TOPIC_WORKER_URL` may also be a static URL template:

```text
https://example.test/feeds/{topic_id}/{sort}-{limit}.json
```

When the URL contains `{topic_id}`, `{sort}`, or `{limit}`, the main service replaces those tokens
instead of appending query parameters. This lets a scheduled free worker publish normalized JSON to
a static host or raw file URL without running a permanent HTTP service.

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

## Worker Verification

The repository includes a free-channel verification workflow:

- `.github/workflows/verify-worker-feed.yml` runs on a schedule or manual dispatch.
- It reads repository variables `TOPIC_WORKER_URL`, `HEYBOX_TOPIC_ID`, `POLL_POST_LIMIT`, and
  `POLL_SORT`.
- It reads secret `TOPIC_WORKER_TOKEN` when the worker needs bearer authentication.
- It runs `deno task verify-worker-feed` and fails if the worker returns no valid normalized posts.

This workflow verifies that a candidate feed worker is producing the contract consumed by the Deno
service. It does not claim that the candidate is production-ready until the returned `publishTime`
feed has been proven to come from the App-side publish-time order.

## Android Worker Candidate

The Android worker candidate is script-first:

- `deno task android-worker-feed` installs or launches Xiaoheihe through `adb`.
- It waits for the App to enter or refresh the target topic page.
- It reads the App hblog net log from `/data/user/0/com.max.xiaoheihe/cache/hblog/content/net/log`.
- It extracts the latest matching `/bbs/app/topic/feeds` response for the requested `POLL_SORT`.
- It writes the same `{ posts: [...] }` JSON consumed by `TOPIC_SOURCE=worker`.

The GitHub Actions workflow `.github/workflows/android-feed-worker.yml` is a validation candidate,
not a promise that GitHub-hosted Android emulation is stable enough for production. The local APK
observed during development is arm64-only, so emulator architecture compatibility is part of the
worker acceptance test.
