import type { PrismaClient, PostStatus, Platform, CommType } from "@prisma/client";

/**
 * A few weeks of plausible work, spread across the pipeline.
 *
 * The seed used to create accounts and clients and nothing else, so every
 * Plan, Insights and Review screen opened empty — which makes the app
 * impossible to judge and awkward to demo. Idempotent: if posts already
 * exist, this leaves them alone.
 */
export async function seedContent(
  prisma: PrismaClient,
  clientIds: Record<string, string>,
  userIds: Record<string, string>,
) {
  const existing = await prisma.post.count();
  if (existing > 0) {
    console.log(`Skipping content — ${existing} posts already here.`);
    return;
  }

  console.log("Seeding campaigns and posts...");

  const u = (name: string) => userIds[`${name}@eyelevelstudio.in`];
  const day = (offset: number, hour = 10) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    d.setHours(hour, 0, 0, 0);
    return d;
  };

  const tnppl = await prisma.campaign.create({
    data: {
      clientId: clientIds["tnpa"],
      name: "TNPPL Season 2",
      description: "Match-day hype, player features and results through the season.",
      startDate: day(-14),
      endDate: day(45),
    },
  });

  const onam = await prisma.campaign.create({
    data: {
      clientId: clientIds["heavens-elix"],
      name: "Onam Launch",
      description: "Festive flavour drop — limited run.",
      startDate: day(-3),
      endDate: day(21),
    },
  });

  type Seed = {
    client: string;
    title: string;
    status: PostStatus;
    platforms: Platform[];
    brief?: string;
    caption?: string;
    hashtags?: string[];
    campaignId?: string;
    designer?: string;
    writer?: string;
    creator: string;
    offset: number;
    hour?: number;
  };

  const posts: Seed[] = [
    // TNPA — a campaign mid-flight, with work at every stage
    { client: "tnpa", title: "TNPPL Season 2 — fixtures reveal", status: "PUBLISHED", platforms: ["INSTAGRAM", "FACEBOOK"],
      caption: "Season 2 is here. Every fixture, every venue — save this one.", hashtags: ["TNPPL", "TamilNaduCricket"],
      campaignId: tnppl.id, designer: "sneha", writer: "shyam", creator: "dilshad", offset: -12, hour: 18 },
    { client: "tnpa", title: "Match day 3 — result card", status: "PUBLISHED", platforms: ["INSTAGRAM"],
      caption: "What a finish. Full scorecard in the app.", hashtags: ["TNPPL"],
      campaignId: tnppl.id, designer: "aditya", writer: "shyam", creator: "dilshad", offset: -5, hour: 21 },
    { client: "tnpa", title: "Player spotlight — opening bat", status: "CLIENT_REVIEW", platforms: ["INSTAGRAM"],
      brief: "Portrait treatment, stats overlay. Keep it bold.",
      caption: "Three fifties in four games. He is not slowing down.", hashtags: ["TNPPL", "PlayerSpotlight"],
      campaignId: tnppl.id, designer: "sneha", writer: "shyam", creator: "dilshad", offset: 2, hour: 19 },
    { client: "tnpa", title: "Semi-final hype reel", status: "IN_DESIGN", platforms: ["INSTAGRAM", "YOUTUBE"],
      brief: "15s vertical cut, crowd audio, fast cuts on the wickets.",
      campaignId: tnppl.id, designer: "aditya", creator: "dilshad", offset: 6, hour: 17 },
    { client: "tnpa", title: "Ticket reminder — final", status: "IDEA", platforms: ["INSTAGRAM", "FACEBOOK"],
      campaignId: tnppl.id, creator: "dilshad", offset: 9 },

    // Right Hospitals — steady health content, one bounced back
    { client: "right-hospitals", title: "World Heart Day explainer", status: "PUBLISHED", platforms: ["INSTAGRAM", "FACEBOOK"],
      caption: "Five numbers worth knowing about your heart. Ask us about a check-up.",
      hashtags: ["HeartHealth", "RightHospitals"], designer: "sneha", writer: "shyam", creator: "dilshad", offset: -8, hour: 9 },
    { client: "right-hospitals", title: "Dr Meera — paediatrics intro", status: "REVISION", platforms: ["INSTAGRAM"],
      brief: "Warm, plain language. No jargon.",
      caption: "Meet Dr Meera, joining our paediatrics team this month.",
      designer: "sneha", writer: "shyam", creator: "dilshad", offset: 3, hour: 11 },
    { client: "right-hospitals", title: "Monsoon health tips carousel", status: "INTERNAL_REVIEW", platforms: ["INSTAGRAM"],
      brief: "Six slides, one tip each, reassuring tone.",
      designer: "sneha", writer: "shyam", creator: "dilshad", offset: 5, hour: 9 },
    { client: "right-hospitals", title: "Diabetes camp announcement", status: "APPROVED", platforms: ["FACEBOOK"],
      caption: "Free screening this Saturday, 8am to 1pm. Walk in, no appointment needed.",
      writer: "shyam", creator: "dilshad", offset: 4, hour: 8 },

    // Heaven's ELIX — a launch in progress
    { client: "heavens-elix", title: "Onam flavour teaser", status: "SCHEDULED", platforms: ["INSTAGRAM"],
      caption: "Something golden is coming.", hashtags: ["Onam", "Kombucha"],
      campaignId: onam.id, designer: "ramya", writer: "shakila", creator: "janani", offset: 1, hour: 12 },
    { client: "heavens-elix", title: "Onam launch — hero post", status: "APPROVED", platforms: ["INSTAGRAM", "FACEBOOK"],
      caption: "Jaggery, ginger, and a little patience. The Onam batch is live.",
      hashtags: ["Onam", "HeavensELIX"], campaignId: onam.id, designer: "ramya", writer: "shakila", creator: "janani", offset: 3, hour: 10 },
    { client: "heavens-elix", title: "Brewing process reel", status: "IN_COPYWRITING", platforms: ["INSTAGRAM"],
      brief: "Slow, tactile shots. Let the process speak.",
      campaignId: onam.id, designer: "ramya", writer: "shakila", creator: "janani", offset: 8, hour: 16 },
    { client: "heavens-elix", title: "Stockist roundup", status: "BRIEFED", platforms: ["INSTAGRAM"],
      brief: "Where to find us — map-style graphic.", creator: "janani", offset: 12 },

    // Da One Sports
    { client: "da-one-sports", title: "Sunday run club recap", status: "PUBLISHED", platforms: ["INSTAGRAM"],
      caption: "42 of you showed up in the rain. That is the club.", hashtags: ["RunClub", "DaOneSports"],
      designer: "ramya", writer: "shakila", creator: "janani", offset: -4, hour: 19 },
    { client: "da-one-sports", title: "New season kit drop", status: "CLIENT_REVIEW", platforms: ["INSTAGRAM", "FACEBOOK"],
      caption: "New kit, same Sunday. Pre-orders open Friday.",
      designer: "ramya", writer: "shakila", creator: "janani", offset: 7, hour: 18 },
    { client: "da-one-sports", title: "Coach Q and A — shin splints", status: "IDEA", platforms: ["INSTAGRAM"],
      creator: "janani", offset: 14 },
  ];

  for (const p of posts) {
    const scheduledAt = day(p.offset, p.hour ?? 10);
    await prisma.post.create({
      data: {
        clientId: clientIds[p.client],
        title: p.title,
        brief: p.brief,
        status: p.status,
        platforms: p.platforms,
        caption: p.caption,
        hashtags: p.hashtags ?? [],
        campaignId: p.campaignId,
        scheduledAt,
        // Backdated for posts already in a stage, so the review-deadline
        // sweep has something realistic to chase.
        statusChangedAt: scheduledAt < new Date() ? scheduledAt : new Date(),
        assignedDesignerId: p.designer ? u(p.designer) : undefined,
        assignedWriterId: p.writer ? u(p.writer) : undefined,
        createdById: u(p.creator),
      },
    });
  }
  console.log(`  ${posts.length} posts across 2 campaigns`);

  console.log("Seeding comms log...");
  const comms: { client: string; type: CommType; summary: string; actionItems: string[]; by: string; offset: number }[] = [
    { client: "tnpa", type: "CALL", summary: "Weekly sync — they want more player-led content before the semis.",
      actionItems: ["Brief Aditya on the hype reel", "Ask for player availability"], by: "dilshad", offset: -2 },
    { client: "right-hospitals", type: "WHATSAPP", summary: "Marketing head flagged the Dr Meera copy as too formal.",
      actionItems: ["Rewrite in plainer language"], by: "shyam", offset: -1 },
    { client: "heavens-elix", type: "MEETING", summary: "Onam launch plan signed off. Hero post goes out Thursday.",
      actionItems: ["Confirm stockist list", "Book the product shoot"], by: "janani", offset: -3 },
    { client: "da-one-sports", type: "EMAIL", summary: "Kit supplier delayed by a week — the pre-order post may need to shift.",
      actionItems: ["Hold the kit drop post"], by: "janani", offset: -1 },
  ];

  for (const c of comms) {
    await prisma.commLog.create({
      data: {
        clientId: clientIds[c.client],
        type: c.type,
        summary: c.summary,
        actionItems: c.actionItems,
        attachmentUrls: [],
        loggedById: u(c.by),
        occurredAt: day(c.offset, 15),
      },
    });
  }
  console.log(`  ${comms.length} comms entries`);
}
