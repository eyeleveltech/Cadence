// Shared with the standalone worker process — no "server-only" guard.
import type { Platform } from "@prisma/client";

export interface PostMetrics {
  reach?: number;
  impressions?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  clicks?: number;
  engagements?: number;
}

export interface FetchMetricsInput {
  platform: Platform;
  externalPostId: string;
  accessToken: string;
}

const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION ?? "v26.0";

function isSimulationTarget(externalPostId: string, accessToken: string): boolean {
  if (process.env.SOCIAL_DEV_SIMULATE === "1") return true;
  if (externalPostId.startsWith("sim_") || externalPostId.startsWith("sandbox_")) return true;
  if (accessToken.startsWith("sim_") || accessToken.includes("mock") || accessToken.includes("test")) {
    return true;
  }
  return false;
}

/**
 * Deterministically generates realistic simulated metrics for local dev/testing
 * based on a numeric seed computed from the externalPostId.
 */
function generateSimulatedMetrics(externalPostId: string): PostMetrics {
  let hash = 0;
  for (let i = 0; i < externalPostId.length; i++) {
    hash = (hash << 5) - hash + externalPostId.charCodeAt(i);
    hash |= 0;
  }
  const seed = Math.abs(hash);

  const impressions = 1200 + (seed % 4500);
  const reach = Math.floor(impressions * 0.78);
  const likes = 35 + (seed % 280);
  const comments = 3 + (seed % 35);
  const shares = 1 + (seed % 20);
  const saves = 2 + (seed % 25);
  const clicks = seed % 40;
  const engagements = likes + comments + shares + saves;

  return {
    impressions,
    reach,
    likes,
    comments,
    shares,
    saves,
    clicks,
    engagements,
  };
}

/**
 * Queries real-time engagement and reach metrics for a published post
 * from the respective platform API.
 */
export async function fetchPostMetrics(input: FetchMetricsInput): Promise<PostMetrics> {
  const { platform, externalPostId, accessToken } = input;

  if (isSimulationTarget(externalPostId, accessToken)) {
    return generateSimulatedMetrics(externalPostId);
  }

  switch (platform) {
    case "INSTAGRAM":
    case "FACEBOOK":
      return fetchMetaMetrics(platform, externalPostId, accessToken);
    case "LINKEDIN":
      return fetchLinkedInMetrics(externalPostId, accessToken);
    case "YOUTUBE":
      return fetchYouTubeMetrics(externalPostId, accessToken);
    case "TWITTER":
      return fetchTwitterMetrics(externalPostId, accessToken);
    default:
      return {};
  }
}

/**
 * Fetches metrics from Meta Graph API for Instagram media or Facebook Page posts.
 */
async function fetchMetaMetrics(
  platform: Platform,
  externalPostId: string,
  accessToken: string,
): Promise<PostMetrics> {
  let likes = 0;
  let comments = 0;
  let impressions = 0;
  let reach = 0;
  let saves = 0;
  let shares = 0;

  // 1. Fetch core fields (likes, comments, shares if available)
  try {
    const postRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${externalPostId}?fields=like_count,comments_count,shares&access_token=${encodeURIComponent(accessToken)}`,
    );
    if (postRes.ok) {
      const postData = (await postRes.json()) as {
        like_count?: number;
        comments_count?: number;
        shares?: { count?: number };
      };
      likes = postData.like_count ?? 0;
      comments = postData.comments_count ?? 0;
      shares = postData.shares?.count ?? 0;
    }
  } catch (err) {
    console.warn(`[analytics] Meta fields fetch error for ${externalPostId}:`, err);
  }

  // 2. Fetch insights (impressions, reach, saved)
  const metricParam =
    platform === "INSTAGRAM"
      ? "impressions,reach,saved,shares"
      : "post_impressions,post_engaged_users";

  try {
    const insightsRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${externalPostId}/insights?metric=${metricParam}&access_token=${encodeURIComponent(accessToken)}`,
    );
    if (insightsRes.ok) {
      const insightsData = (await insightsRes.json()) as {
        data?: Array<{
          name: string;
          values?: Array<{ value: number }>;
        }>;
      };

      if (Array.isArray(insightsData.data)) {
        for (const item of insightsData.data) {
          const val = item.values?.[0]?.value ?? 0;
          if (item.name === "impressions" || item.name === "post_impressions") impressions = val;
          if (item.name === "reach" || item.name === "post_engaged_users") reach = val;
          if (item.name === "saved") saves = val;
          if (item.name === "shares") shares = val;
        }
      }
    }
  } catch (err) {
    console.warn(`[analytics] Meta insights fetch error for ${externalPostId}:`, err);
  }

  const engagements = likes + comments + shares + saves;
  return {
    impressions,
    reach,
    likes,
    comments,
    shares,
    saves,
    engagements,
  };
}

/**
 * Fetches metrics from LinkedIn Social Actions and Share Statistics APIs.
 */
async function fetchLinkedInMetrics(
  externalPostId: string,
  accessToken: string,
): Promise<PostMetrics> {
  let likes = 0;
  let comments = 0;
  let impressions = 0;
  let clicks = 0;
  let shares = 0;

  // 1. Social Actions (likes and comments)
  try {
    const socialRes = await fetch(
      `https://api.linkedin.com/v2/socialActions/${encodeURIComponent(externalPostId)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-Restli-Protocol-Version": "2.0.0",
        },
      },
    );
    if (socialRes.ok) {
      const socialData = (await socialRes.json()) as {
        likesSummary?: { totalLikes?: number };
        commentsSummary?: { totalComments?: number };
      };
      likes = socialData.likesSummary?.totalLikes ?? 0;
      comments = socialData.commentsSummary?.totalComments ?? 0;
    }
  } catch (err) {
    console.warn(`[analytics] LinkedIn social actions fetch error for ${externalPostId}:`, err);
  }

  // 2. Share statistics (impressions, clicks, shares)
  try {
    const statsRes = await fetch(
      `https://api.linkedin.com/v2/organizationalEntityShareStatistics?q=shares&shares=List(${encodeURIComponent(externalPostId)})`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-Restli-Protocol-Version": "2.0.0",
        },
      },
    );
    if (statsRes.ok) {
      const statsData = (await statsRes.json()) as {
        elements?: Array<{
          totalShareStatistics?: {
            impressionCount?: number;
            clickCount?: number;
            shareCount?: number;
            likeCount?: number;
            commentCount?: number;
          };
        }>;
      };
      const stat = statsData.elements?.[0]?.totalShareStatistics;
      if (stat) {
        if (stat.impressionCount) impressions = stat.impressionCount;
        if (stat.clickCount) clicks = stat.clickCount;
        if (stat.shareCount) shares = stat.shareCount;
        if (stat.likeCount && !likes) likes = stat.likeCount;
        if (stat.commentCount && !comments) comments = stat.commentCount;
      }
    }
  } catch (err) {
    console.warn(`[analytics] LinkedIn statistics fetch error for ${externalPostId}:`, err);
  }

  const engagements = likes + comments + shares + clicks;
  return {
    impressions,
    reach: impressions,
    likes,
    comments,
    shares,
    clicks,
    engagements,
  };
}

/**
 * Fetches video metrics from YouTube Data API v3.
 */
async function fetchYouTubeMetrics(
  externalPostId: string,
  accessToken: string,
): Promise<PostMetrics> {
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${encodeURIComponent(externalPostId)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`YouTube analytics fetch failed: ${errText}`);
  }

  const data = (await res.json()) as {
    items?: Array<{
      statistics?: {
        viewCount?: string;
        likeCount?: string;
        commentCount?: string;
      };
    }>;
  };

  const stats = data.items?.[0]?.statistics;
  const views = stats?.viewCount ? parseInt(stats.viewCount, 10) : 0;
  const likes = stats?.likeCount ? parseInt(stats.likeCount, 10) : 0;
  const comments = stats?.commentCount ? parseInt(stats.commentCount, 10) : 0;
  const engagements = likes + comments;

  return {
    impressions: views,
    reach: views,
    likes,
    comments,
    engagements,
  };
}

/**
 * Fetches tweet metrics from Twitter API v2.
 */
async function fetchTwitterMetrics(
  externalPostId: string,
  accessToken: string,
): Promise<PostMetrics> {
  const res = await fetch(
    `https://api.twitter.com/2/tweets/${encodeURIComponent(externalPostId)}?tweet.fields=public_metrics`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Twitter analytics fetch failed: ${errText}`);
  }

  const data = (await res.json()) as {
    data?: {
      public_metrics?: {
        impression_count?: number;
        like_count?: number;
        reply_count?: number;
        retweet_count?: number;
        quote_count?: number;
        bookmark_count?: number;
      };
    };
  };

  const metrics = data.data?.public_metrics;
  const impressions = metrics?.impression_count ?? 0;
  const likes = metrics?.like_count ?? 0;
  const comments = metrics?.reply_count ?? 0;
  const shares = (metrics?.retweet_count ?? 0) + (metrics?.quote_count ?? 0);
  const saves = metrics?.bookmark_count ?? 0;
  const engagements = likes + comments + shares + saves;

  return {
    impressions,
    reach: impressions,
    likes,
    comments,
    shares,
    saves,
    engagements,
  };
}

