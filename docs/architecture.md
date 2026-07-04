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

The Android worker workflow can publish the generated JSON to the `worker-feed` branch when
`PUBLISH_WORKER_FEED=true`. With the default topic and limit, the main Deno service can consume it
with a static template like:

```text
https://raw.githubusercontent.com/YuanXiQWQ/heybox-topic-notifier/worker-feed/feeds/{topic_id}/{sort}-{limit}.json
```

This keeps the production Deno service cloud-run and no-cost while treating the Android side as a
replaceable scheduled feed producer.

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

For local multi-device ADB setups, set `ANDROID_SERIAL` or `ANDROID_ADB_SERIAL` so the script does
not fail with "more than one device/emulator". If cold deep links only open `RouterActivity` and
return to the launcher, set `HEYBOX_ANDROID_PRELAUNCH_MS` to start `HEYBOX_LAUNCH_ACTIVITY` first,
wait for App initialization, and then dispatch `HEYBOX_DEEPLINK_URL`.

`HEYBOX_ANDROID_NAVIGATION` supports `sleep`, raw-coordinate `tap`, `tap_id`, `tap_text`,
`tap_text_b64`, `swipe`, `keyevent`, and `text` commands. Prefer `tap_id` and `tap_text_b64` for
stable validation and ASCII-only repository variables, for example:

```text
tap_id fbv_sort; sleep 1500; tap_text_b64 5Y+R5biD5pe26Ze0
```

That sequence opens the topic sort menu and selects the App-side publish-time feed. The resulting
hblog request must include `sort_filter=create`; otherwise the worker must fail instead of locally
reordering smart-sort posts.

The GitHub Actions workflow `.github/workflows/android-feed-worker.yml` is a validation candidate,
not a promise that GitHub-hosted Android emulation is stable enough for production. By default it
uses GitHub's `ubuntu-24.04-arm` runner because the current Xiaoheihe APK is arm64-only. Repository
variable `HEYBOX_ANDROID_RUNNER` can override the runner label for experiments. The workflow
downloads the Android package from Tencent App Store's CDN and falls back to the Xiaoheihe website
package at `https://dl.max-c.com/app/heybox/heybox-release.apk`. Repository secret or variable
`HEYBOX_APK_URL` can override the primary URL, and repository variable `HEYBOX_APK_FALLBACK_URLS`
can provide comma-separated fallback URLs if either public download path changes.

During local validation, LDPlayer can still be useful for manual UI and hblog checks, but it is not
part of the production design. If a local x86/native-bridge emulator cannot keep the current App
version running, use the saved hblog parser tests and the arm64 GitHub Actions worker candidate as
the next validation path.
