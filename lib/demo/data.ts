import type { PostStatus, Platform, Role, CommType } from "@prisma/client";

// Static sample data for the /demo tree — no database, no auth, nothing
// here is ever written to. Numbers and names are fictional; shaped to
// look like a real few weeks of retainer work across four clients.

export type DemoUser = { id: string; name: string; role: Role; initials: string };

export type DemoPost = {
  id: string;
  clientId: string;
  title: string;
  brief: string;
  status: PostStatus;
  platforms: Platform[];
  caption: string;
  hashtags: string[];
  scheduledAt: string | null; // ISO
  updatedAt: string; // ISO
  assignedDesigner: string | null;
  assignedWriter: string | null;
  comments: { id: string; author: string; type: "COMMENT" | "APPROVAL" | "REVISION_REQUEST"; body: string; at: string }[];
};

export type DemoClient = {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "PAUSED";
  toneOfVoice: string;
};

export type DemoComm = {
  id: string;
  clientId: string;
  type: CommType;
  summary: string;
  actionItems: string[];
  occurredAt: string;
  loggedBy: string;
};

export type DemoMoodBoard = {
  id: string;
  clientId: string;
  name: string;
  items: { id: string; title: string; tags: string[] }[];
};

export type DemoLibraryAsset = {
  id: string;
  clientId: string;
  label: string;
  kind: "IMAGE" | "VIDEO";
  placed: boolean;
};

export const DEMO_USERS: DemoUser[] = [
  { id: "demo-akmal", name: "Akmal Rahman", role: "ADMIN", initials: "AR" },
  { id: "demo-dilshad", name: "Dilshad", role: "MANAGER", initials: "D" },
  { id: "demo-janani", name: "Janani", role: "MANAGER", initials: "J" },
  { id: "demo-shyam", name: "Shyam", role: "WRITER", initials: "S" },
  { id: "demo-shakila", name: "Shakila", role: "WRITER", initials: "S" },
  { id: "demo-sneha", name: "Sneha", role: "DESIGNER", initials: "S" },
  { id: "demo-ramya", name: "Ramya", role: "DESIGNER", initials: "R" },
];

export const DEMO_CLIENTS: DemoClient[] = [
  { id: "right-hospitals", name: "Right Hospitals", slug: "right-hospitals", status: "ACTIVE", toneOfVoice: "Warm, reassuring, plain-language healthcare communication." },
  { id: "heavens-elix", name: "Heaven's ELIX", slug: "heavens-elix", status: "ACTIVE", toneOfVoice: "Playful, wellness-forward, kombucha-brand energy." },
  { id: "tnpa", name: "TNPA", slug: "tnpa", status: "ACTIVE", toneOfVoice: "High-energy sports and event hype — TNPPL Season 2." },
  { id: "da-one-sports", name: "Da One Sports", slug: "da-one-sports", status: "ACTIVE", toneOfVoice: "Community-first, active-lifestyle, encouraging." },
];

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(10, 0, 0, 0);
  return d.toISOString();
};

export const DEMO_POSTS: DemoPost[] = [
  {
    id: "post-onam-carousel", clientId: "right-hospitals", title: "Onam offer carousel",
    brief: "Seasonal health checkup offer, festive tone.", status: "CLIENT_REVIEW",
    platforms: ["INSTAGRAM", "FACEBOOK"], caption: "This Onam, gift your family the best health check 🌼", hashtags: ["onam", "healthcare", "chennaihealth"],
    scheduledAt: day(2), updatedAt: day(-1), assignedDesigner: "Sneha", assignedWriter: "Shyam",
    comments: [{ id: "c1", author: "Dr Kavya Somesh", type: "COMMENT", body: "Can we make the CTA bigger?", at: day(-1) }],
  },
  {
    id: "post-flu-season", clientId: "right-hospitals", title: "Flu season checklist",
    brief: "Doctor-led explainer video.", status: "IN_DESIGN",
    platforms: ["INSTAGRAM"], caption: "5 signs it's more than a cold.", hashtags: ["flu", "healthtips"],
    scheduledAt: day(6), updatedAt: day(-2), assignedDesigner: "Sneha", assignedWriter: null, comments: [],
  },
  {
    id: "post-monsoon", clientId: "right-hospitals", title: "Monsoon health checklist",
    brief: "", status: "APPROVED", platforms: ["FACEBOOK", "INSTAGRAM"], caption: "Stay dry, stay well.", hashtags: ["monsoon"],
    scheduledAt: day(4), updatedAt: day(-3), assignedDesigner: "Sneha", assignedWriter: "Shyam", comments: [],
  },
  {
    id: "post-elix-brew", clientId: "heavens-elix", title: "Founder story: the first brew",
    brief: "Origin story reel.", status: "INTERNAL_REVIEW", platforms: ["INSTAGRAM", "YOUTUBE"],
    caption: "It started in a kitchen in Besant Nagar.", hashtags: ["kombucha", "founderstory"],
    scheduledAt: day(3), updatedAt: day(0), assignedDesigner: "Ramya", assignedWriter: "Shakila", comments: [],
  },
  {
    id: "post-elix-flavor", clientId: "heavens-elix", title: "New flavor launch — Ginger Beet",
    brief: "", status: "IDEA", platforms: ["INSTAGRAM"], caption: "", hashtags: [],
    scheduledAt: null, updatedAt: day(-5), assignedDesigner: null, assignedWriter: null, comments: [],
  },
  {
    id: "post-tnppl-open", clientId: "tnpa", title: "Opening ceremony schedule",
    brief: "", status: "REVISION", platforms: ["INSTAGRAM", "FACEBOOK"], caption: "Gates open 5 PM sharp!", hashtags: ["tnppl", "pickleball"],
    scheduledAt: day(1), updatedAt: day(0), assignedDesigner: "Sneha", assignedWriter: "Shyam",
    comments: [{ id: "c2", author: "Tanuja", type: "REVISION_REQUEST", body: "Venue map is outdated — swap for the Express Avenue floor plan.", at: day(0) }],
  },
  {
    id: "post-tnppl-vip", clientId: "tnpa", title: "Sponsor spotlight — VIP lounge",
    brief: "", status: "SCHEDULED", platforms: ["INSTAGRAM"], caption: "Thank you to our title sponsors.", hashtags: ["tnppl"],
    scheduledAt: day(1), updatedAt: day(-1), assignedDesigner: "Aditya", assignedWriter: "Shyam", comments: [],
  },
  {
    id: "post-tnppl-published", clientId: "tnpa", title: "Countdown: 3 days to go",
    brief: "", status: "PUBLISHED", platforms: ["INSTAGRAM", "FACEBOOK"], caption: "72 hours until first serve.", hashtags: ["tnppl"],
    scheduledAt: day(-2), updatedAt: day(-2), assignedDesigner: "Sneha", assignedWriter: "Shyam", comments: [],
  },
  {
    id: "post-daone-batch", clientId: "da-one-sports", title: "Gwalior batch highlights",
    brief: "", status: "BRIEFED", platforms: ["INSTAGRAM"], caption: "", hashtags: [],
    scheduledAt: day(8), updatedAt: day(-4), assignedDesigner: null, assignedWriter: "Shakila", comments: [],
  },
  {
    id: "post-daone-fail", clientId: "da-one-sports", title: "Coach interview clip",
    brief: "", status: "FAILED", platforms: ["YOUTUBE"], caption: "Meet Coach Arjun.", hashtags: [],
    scheduledAt: day(-1), updatedAt: day(-1), assignedDesigner: "Ramya", assignedWriter: null, comments: [],
  },
];

export const DEMO_COMMS: DemoComm[] = [
  { id: "comm1", clientId: "right-hospitals", type: "WHATSAPP", summary: "Dr Kavya confirmed Onam post goes out Wednesday.", actionItems: ["Send revised caption by Tuesday"], occurredAt: day(-1), loggedBy: "Dilshad" },
  { id: "comm2", clientId: "right-hospitals", type: "CALL", summary: "Discussed Q4 campaign budget increase.", actionItems: [], occurredAt: day(-6), loggedBy: "Dilshad" },
  { id: "comm3", clientId: "tnpa", type: "MEETING", summary: "Venue walkthrough with TNPA ops team at Express Avenue.", actionItems: ["Update floor plan graphic", "Confirm sponsor banner sizes"], occurredAt: day(-2), loggedBy: "Tanuja" },
  { id: "comm4", clientId: "heavens-elix", type: "EMAIL", summary: "Founder approved the first-brew story, hold investor mention till October.", actionItems: [], occurredAt: day(-4), loggedBy: "Shakila" },
];

export const DEMO_BOARDS: DemoMoodBoard[] = [
  { id: "board1", clientId: "right-hospitals", name: "Onam 2026", items: [
    { id: "b1", title: "Warm festive palette reference", tags: ["festive", "warm"] },
    { id: "b2", title: "Clean clinical typography", tags: ["clean", "trust"] },
  ] },
  { id: "board2", clientId: "tnpa", name: "TNPPL Season 2", items: [
    { id: "b3", title: "Stadium lighting mood", tags: ["bold", "energy"] },
  ] },
];

export const DEMO_LIBRARY: DemoLibraryAsset[] = [
  { id: "a1", clientId: "right-hospitals", label: "onam-carousel-1.jpg", kind: "IMAGE", placed: true },
  { id: "a2", clientId: "right-hospitals", label: "onam-carousel-2.jpg", kind: "IMAGE", placed: true },
  { id: "a3", clientId: "right-hospitals", label: "flu-explainer.mp4", kind: "VIDEO", placed: false },
  { id: "a4", clientId: "tnpa", label: "opening-ceremony-map.jpg", kind: "IMAGE", placed: true },
  { id: "a5", clientId: "tnpa", label: "vip-lounge-sponsors.jpg", kind: "IMAGE", placed: false },
];

export function demoPostsForClient(clientId: string) {
  return DEMO_POSTS.filter((p) => p.clientId === clientId);
}
export function demoClient(clientId: string) {
  return DEMO_CLIENTS.find((c) => c.id === clientId);
}
export function demoPost(postId: string) {
  return DEMO_POSTS.find((p) => p.id === postId);
}
export function demoCommsForClient(clientId: string) {
  return DEMO_COMMS.filter((c) => c.clientId === clientId);
}
export function demoBoardsForClient(clientId: string) {
  return DEMO_BOARDS.filter((b) => b.clientId === clientId);
}
export function demoLibraryForClient(clientId: string) {
  return DEMO_LIBRARY.filter((a) => a.clientId === clientId);
}
