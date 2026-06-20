import { getVariable, getState, setState } from "windmill-client";

type State = {
  processedCommentIds?: Record<string, string>;
};

type FeedEntry = {
  id: string;
  title: string;
  author: string;
  permalink: string;
  content: string;
};

type ReviewResult = {
  repo_url: string;
  comment_id?: string;
  comment_permalink?: string;
  author?: string;
  confidence?: number;
  risk_level?: string;
  review_recommendation?: string;
  ai_assistance_likelihood?: number;
  disclosed_ai_use?: boolean | "unknown";
  discord_summary?: string;
  findings?: string[];
  limitations?: string[];
};

export async function main() {
  const reviewServiceUrl = (await getVariable("f/selfhosted/review_service_url")).replace(/\/$/, "");
  const reviewServiceToken = await getVariable("f/selfhosted/review_service_token");
  const discordWebhookUrl = await getVariable("f/selfhosted/discord_webhook_url");
  const threshold = Number((await getVariable("f/selfhosted/confidence_threshold")) || 70);
  const currentMegathreadUrl = await getVariable("f/selfhosted/current_megathread_url");

  const state: State = (await getState()) || {};
  state.processedCommentIds ||= {};

  const megathread = parseMegathreadUrl(currentMegathreadUrl);
  const feedUrl = `https://www.reddit.com/r/selfhosted/comments/${megathread.id}/.rss?sort=new&depth=1`;
  const feedXml = await getText(feedUrl);
  const entries = parseAtomEntries(feedXml);

  const candidates = entries
    .filter((entry) => entry.author !== "/u/AutoModerator")
    .map((entry) => {
      const commentBody = stripHtml(entry.content);

      return {
        entry,
        commentBody,
        commentId: extractCommentId(entry),
        repoUrls: extractRepoUrls(commentBody)
      };
    })
    .filter(
      (candidate) =>
        candidate.commentId &&
        !state.processedCommentIds![candidate.commentId] &&
        candidate.repoUrls.length > 0
    );

  const reports = [];

  for (const candidate of candidates) {
    const commentId = candidate.commentId;
    state.processedCommentIds[commentId] = new Date().toISOString();

    for (const repoUrl of candidate.repoUrls) {
      const review: ReviewResult = await postJson(
        `${reviewServiceUrl}/review`,
        {
          repo_url: repoUrl,
          comment_id: commentId,
          comment_permalink: candidate.entry.permalink,
          comment_body: candidate.commentBody,
          comment_claimed_no_ai: commentClaimsNoAi(candidate.commentBody),
          author: candidate.entry.author.replace(/^\/u\//, "")
        },
        {
          Authorization: `Bearer ${reviewServiceToken}`
        }
      );

      if (Number(review.confidence || 0) >= threshold) {
        await postDiscord(discordWebhookUrl, review);
        reports.push({
          repo_url: repoUrl,
          confidence: review.confidence,
          risk_level: review.risk_level,
          review_recommendation: review.review_recommendation,
          comment_id: commentId,
          permalink: candidate.entry.permalink
        });
      }

      await sleep(2500);
    }
  }

  await setState(state);

  return {
    feed: feedUrl,
    entries_seen: entries.length,
    new_repo_comments: candidates.length,
    reports_sent: reports.length,
    reports
  };
}

function parseMegathreadUrl(url: string) {
  const match = String(url || "").match(/\/comments\/([a-z0-9]+)\//i);
  if (!match) {
    throw new Error(`Invalid Reddit megathread URL: ${url}`);
  }

  return {
    id: match[1],
    name: `t3_${match[1]}`
  };
}

function parseAtomEntries(xml: string): FeedEntry[] {
  const entryMatches = [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/g)];

  return entryMatches.map((match) => {
    const entryXml = match[0];

    return {
      id: decodeXml(extractTag(entryXml, "id")),
      title: decodeXml(extractTag(entryXml, "title")),
      author: decodeXml(extractNestedTag(entryXml, "author", "name")),
      permalink: decodeXml(extractAlternateLink(entryXml)),
      content: decodeXml(extractTag(entryXml, "content"))
    };
  });
}

function extractTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match?.[1] || "";
}

function extractNestedTag(xml: string, parentTag: string, childTag: string): string {
  const parent = extractTag(xml, parentTag);
  return extractTag(parent, childTag);
}

function extractAlternateLink(xml: string): string {
  const match = xml.match(/<link\b[^>]*rel="alternate"[^>]*href="([^"]+)"/i);
  return match?.[1] || "";
}

function extractCommentId(entry: FeedEntry): string {
  const fromPermalink = entry.permalink.match(/\/comments\/[a-z0-9]+\/[^/]+\/([a-z0-9]+)\/?/i);
  if (fromPermalink) return fromPermalink[1];

  const fromId = entry.id.match(/\/([a-z0-9]+)$/i);
  if (fromId) return fromId[1];

  return entry.id || entry.permalink;
}

function extractRepoUrls(body: string): string[] {
  const pattern =
    /https?:\/\/(?:www\.)?(?:github\.com|gitlab\.com|codeberg\.org)\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.%\\-]+(?:\.git)?(?:[/?#][^\s)\]}>'"]*)?|https?:\/\/git\.sr\.ht\/[~A-Za-z0-9_.-]+\/[A-Za-z0-9_.%\\-]+(?:\.git)?(?:[/?#][^\s)\]}>'"]*)?/gi;
  const normalizedBody = body.replace(/%5[Cc]_/g, "_").replace(/\\_/g, "_");

  return [...new Set((normalizedBody.match(pattern) || []).map(cleanRepoUrl))];
}

function stripHtml(html: string): string {
  return html
    .replace(/<a\b[^>]*\bhref=(["'])(.*?)\1[^>]*>[\s\S]*?<\/a>/gi, " $2 ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanRepoUrl(url: string): string {
  const cleaned = url.replace(/[.,;:]+$/, "");

  try {
    const parsed = new URL(cleaned);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const parts = parsed.pathname.split("/").filter(Boolean);

    if (["github.com", "gitlab.com", "codeberg.org"].includes(host) && parts.length >= 2) {
      const repo = decodeURIComponent(parts[1]).replace(/\\/g, "").replace(/\.git$/i, "");
      return `${parsed.protocol}//${host}/${parts[0]}/${repo}`;
    }

    if (host === "git.sr.ht" && parts.length >= 2) {
      const repo = decodeURIComponent(parts[1]).replace(/\\/g, "").replace(/\.git$/i, "");
      return `${parsed.protocol}//${host}/${parts[0]}/${repo}`;
    }
  } catch {
    // Fall back to the regex match if URL parsing fails unexpectedly.
  }

  return cleaned;
}

function commentClaimsNoAi(body: string): boolean {
  const normalized = body.toLowerCase();

  return [
    /\bno ai\b/,
    /\bno artificial intelligence\b/,
    /\bnot ai generated\b/,
    /\bnot ai-generated\b/,
    /\bwithout ai\b/,
    /\bdid not use ai\b/,
    /\bdidn't use ai\b/,
    /\bi did not use ai\b/,
    /\bi didn't use ai\b/,
    /\bno llm\b/,
    /\bwithout llm\b/,
    /\bdid not use (?:an? )?llm\b/,
    /\bdidn't use (?:an? )?llm\b/
  ].some((pattern) => pattern.test(normalized));
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

async function getText(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "linuxbox:r-selfhosted-ai-detector:0.1",
      Accept: "application/atom+xml, application/rss+xml, application/xml, text/xml"
    }
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${response.status} ${text.slice(0, 500)}`);
  }

  return text;
}

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text.slice(0, 500) };
  }

  if (!response.ok) {
    throw new Error(`POST ${url} failed: ${response.status} ${JSON.stringify(json)}`);
  }

  return json;
}

function buildDiscordContent(review: ReviewResult): string {
  const fallback = [
    `AI Detector: ${review.repo_url}`,
    `Undisclosed-risk: ${Math.round(Number(review.confidence || 0))}% (${review.risk_level || "unknown"}, ${review.review_recommendation || "unknown"})`,
    `AI assistance likelihood: ${review.ai_assistance_likelihood ?? "unknown"}% | Disclosed AI use: ${String(review.disclosed_ai_use ?? "unknown")}`,
    "",
    ...(review.findings?.length
      ? ["Findings:", ...review.findings.slice(0, 4).map((finding) => `- ${finding}`)]
      : []),
    ...(review.limitations?.length
      ? ["Limitations:", ...review.limitations.slice(0, 2).map((limitation) => `- ${limitation}`)]
      : [])
  ].join("\n");

  const content = review.discord_summary || fallback;

  if (content.length <= 2000) {
    return content;
  }

  return `${content.slice(0, 1940)}\n... truncated; see Windmill logs for full review JSON.`;
}

async function postDiscord(webhookUrl: string, review: ReviewResult) {
  await postJson(webhookUrl, {
    username: "r/selfhosted AI Detector",
    content: buildDiscordContent(review)
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
