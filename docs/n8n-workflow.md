# n8n Workflow

This workflow polls the active r/selfhosted megathread, extracts new top-level comments with Git repository links, sends each repository to the review service, and posts qualifying results to Discord for moderator review.

## Import

1. In n8n, choose **Import from file**.
2. Select `workflows/r-selfhosted-ai-detector.n8n.json`.
3. Configure the environment variables below for the n8n instance.
4. Run the workflow once manually with pinned/sample data before activating it.

The workflow is inactive by default after import.

## Configuration

Required n8n environment variables:

- `REVIEW_SERVICE_URL`: Base URL for this service, for example `http://ai-detector:8080`.
- `REVIEW_SERVICE_TOKEN`: Bearer token matching the service's `REVIEW_SERVICE_TOKEN`.
- `AI_DETECTOR_DISCORD_WEBHOOK_URL`: Discord channel webhook URL for moderator reports.

Optional n8n environment variables:

- `AI_DETECTOR_CONFIDENCE_THRESHOLD`: Minimum confidence score to report. Defaults to `70`.
- `AI_DETECTOR_POLL_MINUTES`: Schedule interval in minutes. Defaults to `10`.
- `AI_DETECTOR_MEGATHREAD_FLAIR`: Flair used to identify weekly project megathreads. Defaults to `New Project Megathread`.

The workflow uses Reddit's public JSON endpoints:

- `https://www.reddit.com/r/selfhosted/search.json?q=flair_name%3A%22New%20Project%20Megathread%22&restrict_sr=on&sort=new&t=month&limit=5`
- `https://www.reddit.com/comments/{thread_id}.json?limit=500&sort=new`

If public reads become unreliable or the deployment requires authenticated Reddit access, replace those HTTP Request nodes with n8n Reddit nodes using the same data shape: active thread ID, top-level comments, author, comment ID, body, and permalink.

## Deduplication

`Extract New Repo Comments` stores processed comment IDs in n8n global workflow static data. This is intentionally small persistent state owned by n8n, not by the review service. The review service remains stateless and only receives one repository plus passthrough Reddit context per request.

To reprocess old comments during testing, clear the workflow static data in n8n or duplicate/import a fresh copy of the workflow.

## Workflow Nodes

- `Every 10 Minutes`: Polling schedule.
- `Search New Project Megathreads`: Searches recent r/selfhosted posts with the `New Project Megathread` flair.
- `Select Active Megathread`: Picks the flair-matched post whose title contains the current `Week of DD MMM YYYY` date window, falling back to the newest matching flair post.
- `Fetch Megathread Comments`: Gets up to 500 comments for the selected thread.
- `Extract New Repo Comments`: Keeps top-level comments only, extracts GitHub, GitLab, Codeberg, and sourcehut repository URLs, and skips already processed comment IDs.
- `Review Repository`: Calls `POST /review` with `repo_url`, `comment_id`, `comment_permalink`, and `author`.
- `Meets Confidence Threshold`: Routes only responses whose `confidence` meets the configured threshold.
- `Send Discord Report`: Posts the permalink, repository, confidence, findings, metadata signals, and disclosure note to Discord.

## Manual Test Checklist

Before activating the workflow in production, run it with pinned/sample Reddit and review-service responses and confirm:

- Replies are skipped.
- Comments without repository links are skipped.
- Duplicate comment IDs do not send again.
- The review-service request includes `Authorization: Bearer REVIEW_SERVICE_TOKEN`.
- Below-threshold review responses do not hit Discord.
- Above-threshold review responses format cleanly in Discord.

## Mod Queue Delivery

The default workflow sends reports to Discord only. If moderators want Reddit-side delivery later, add a branch after `Meets Confidence Threshold` that posts to modmail or another moderator-only destination. Keep Discord and modmail independently configurable so either destination can be disabled without changing review-service behavior.
