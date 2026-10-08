// Starter ideas for the Learning library: what people usually take for a subject, so a long list can be added in a few taps.
// Only titles, the kind of thing and the platform it is usually on (no links: they change). The "Search" buttons find the
// current page. Add your own rows: `match` is tested against the name of your course or the subject you pick.
import type { ResourceKind } from "./types.ts";

export type StarterIdea = { title: string; kind: ResourceKind; platform: string; hours: number; skills: string[] };
export type StarterSubject = { subject: string; match: RegExp; ideas: StarterIdea[] };

const course = (title: string, platform: string, hours: number, skills: string[]): StarterIdea => ({ title, kind: "certificate", platform, hours, skills });
const playlist = (title: string, hours: number, skills: string[]): StarterIdea => ({ title, kind: "playlist", platform: "YouTube", hours, skills });

export const STARTER_IDEAS: StarterSubject[] = [
  {
    subject: "Digital Marketing",
    match: /marketing|seo|ads|social media|facebook|google/i,
    ideas: [
      course("Fundamentals of Digital Marketing", "Google", 40, ["Digital Marketing"]),
      course("SEO basics: keywords, on-page and links", "HubSpot Academy", 5, ["SEO"]),
      course("Google Ads Search certification", "Google", 8, ["Google Ads"]),
      course("Google Analytics 4 certification", "Google", 6, ["Google Analytics"]),
      course("Meta (Facebook) Ads and Blueprint basics", "Meta Blueprint", 10, ["Facebook Ads"]),
      course("Social media marketing", "HubSpot Academy", 5, ["Social Media Marketing"]),
      course("Email marketing", "HubSpot Academy", 4, ["Email Marketing"]),
      course("Content marketing and copywriting", "HubSpot Academy", 5, ["Content Writing", "Copywriting"]),
      playlist("SEO full course for beginners", 8, ["SEO"]),
      playlist("Facebook ads tutorial from zero", 6, ["Facebook Ads"]),
      playlist("Google Ads tutorial for beginners", 6, ["Google Ads"]),
    ],
  },
  {
    subject: "Web & WordPress",
    match: /web|wordpress|html|css|javascript|front|react|php/i,
    ideas: [
      course("Responsive Web Design (HTML and CSS)", "freeCodeCamp", 30, ["HTML", "CSS"]),
      course("JavaScript basics", "freeCodeCamp", 30, ["JavaScript"]),
      course("Git and GitHub for beginners", "Coursera", 6, ["Git"]),
      playlist("WordPress website from scratch", 6, ["WordPress", "Elementor"]),
      playlist("HTML and CSS full course", 10, ["HTML", "CSS"]),
      playlist("JavaScript full course", 12, ["JavaScript"]),
      playlist("React for beginners", 10, ["React"]),
    ],
  },
  {
    subject: "Data & Excel",
    match: /data|sql|excel|analy|power bi|python|statistic/i,
    ideas: [
      course("SQL for data analysis", "Coursera", 15, ["SQL"]),
      course("Excel skills for business", "Coursera", 20, ["Excel"]),
      course("Data analysis with Power BI", "Microsoft Learn", 10, ["Power BI", "Data Analysis"]),
      course("Python for everybody", "Coursera", 30, ["Python"]),
      playlist("Advanced Excel full course", 8, ["Excel"]),
      playlist("SQL full course", 8, ["SQL"]),
    ],
  },
  {
    subject: "Design",
    match: /design|figma|canva|photoshop|graphic|ui|ux|video/i,
    ideas: [
      course("Graphic design basics", "Coursera", 15, ["Graphic Design"]),
      course("UI/UX design foundations", "Google", 20, ["UI/UX Design", "Figma"]),
      playlist("Canva for beginners", 3, ["Canva"]),
      playlist("Photoshop for beginners", 6, ["Photoshop"]),
      playlist("Figma full course", 5, ["Figma"]),
      playlist("Video editing for beginners", 5, ["Video Editing"]),
    ],
  },
  {
    subject: "Freelancing & business",
    match: /freelanc|business|sales|client|office|account|project/i,
    ideas: [
      playlist("Freelancing for beginners: profile, gigs and proposals", 5, ["Communication"]),
      course("Project management foundations", "Google", 20, ["Project Management"]),
      course("Business communication", "Coursera", 10, ["Communication"]),
      course("Accounting basics", "Alison", 8, ["Accounting"]),
      playlist("Microsoft Office (Word, Excel, PowerPoint)", 8, ["Microsoft Office"]),
    ],
  },
  {
    subject: "English & communication",
    match: /english|communicat|speak|ielts|writing/i,
    ideas: [
      playlist("Spoken English practice", 10, ["English", "Communication"]),
      course("Business English and email writing", "Coursera", 12, ["English", "Report Writing"]),
      playlist("IELTS preparation", 15, ["English"]),
      course("Presentation and public speaking", "Coursera", 8, ["Presentation"]),
    ],
  },
];

/** The ideas for a subject name typed or chosen by the person ("Digital Marketing 2026" → Digital Marketing). Empty list if none fits. */
export function ideasFor(name: string): StarterSubject | null {
  const text = name.trim();
  return text ? (STARTER_IDEAS.find((s) => s.subject.toLowerCase() === text.toLowerCase()) ?? STARTER_IDEAS.find((s) => s.match.test(text)) ?? null) : null;
}

/** Links that search for the idea on YouTube and on the web (opened in a new tab). */
export const searchLinks = (title: string) => ({
  youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(title)}`,
  web: `https://www.google.com/search?q=${encodeURIComponent(`${title} course`)}`,
});
