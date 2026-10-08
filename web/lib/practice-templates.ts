// Hands-on practice: turning a finished course or playlist into a small project with real tasks.
// Watching is not experience, so every plan follows the same ladder (redo it, apply it, publish proof, teach it back,
// get feedback, add it to your profile) with 1-3 steps in the middle that fit the subject. Rules only, no AI.
// Add your own subjects: `keys` are skill names (as in lib/skills.ts) or words from the title.
import { addDays } from "./dates.ts";
import { findSkills } from "./skills.ts";

export type PracticeStep = { title: string; notes: string };
type Subject = { name: string; keys: string[]; goal: string; steps: PracticeStep[] };

// Sized for a small budget: free tools first, and the paid steps are small or optional.
export const PRACTICE_SUBJECTS: Subject[] = [
  {
    name: "SEO", keys: ["seo", "search engine"], goal: "improve a real website's search visibility",
    steps: [
      { title: "Audit one local business website with a free SEO checklist (find the 10 biggest issues)", notes: "Pick a small shop, a friend's site or your own. Write the 10 issues in a note, most important first." },
      { title: "Fix 3 of the issues and keep before/after screenshots", notes: "Titles, descriptions, image sizes or broken links are good first fixes. The screenshots are your proof." },
      { title: "Research keywords for 5 pages and write each page's title and description", notes: "Use a free keyword tool. One main keyword per page." },
    ],
  },
  {
    name: "Google Ads", keys: ["google ads", "adwords", "ppc"], goal: "run a small search campaign and learn from the numbers",
    steps: [
      { title: "Plan a small Google Ads search campaign on paper: 10 keywords, 3 ads, a daily budget", notes: "Think of a real local business. Write what a click is worth to it." },
      { title: "Build it in Google Ads (launch with a few hundred ৳, or stop before launching and use the Keyword Planner)", notes: "No budget? Build everything and take screenshots of the finished campaign instead." },
      { title: "After 7 days compare clicks, CTR and cost per click, and write what you would change", notes: "Three lines are enough: what worked, what did not, what you would try next." },
    ],
  },
  {
    name: "Facebook & social media", keys: ["facebook ads", "social media marketing", "social media", "meta ads"], goal: "run one page for 30 days and learn what people react to",
    steps: [
      { title: "Make a 30-day content calendar for one page (12 posts: ideas, captions, pictures)", notes: "A real page: yours, a friend's shop, or a new one for a topic you like." },
      { title: "Publish the posts and note the reach of each in a sheet", notes: "Columns: date, post, reach, reactions. After 12 posts, which kind did best?" },
      { title: "Boost one post with a small budget and compare two audiences", notes: "Even ৳200-300 shows how targeting changes the result." },
    ],
  },
  {
    name: "Email marketing", keys: ["email marketing", "mailchimp"], goal: "write and send a small email sequence",
    steps: [
      { title: "Write a 3-email welcome sequence for a real or sample business", notes: "Email 1: welcome and one promise. Email 2: help. Email 3: a small offer." },
      { title: "Set it up in a free plan (Mailchimp or Brevo) and send it to 5 friends", notes: "Check that the links work and that it looks good on a phone." },
    ],
  },
  {
    name: "Google Analytics", keys: ["google analytics", "ga4"], goal: "see what real visitors do on a site",
    steps: [
      { title: "Install GA4 on your own site or a friend's", notes: "Check in the real-time report that your own visit shows up." },
      { title: "Write 5 questions the data can answer (top pages, where visitors come from …) and answer them", notes: "A short note with the 5 answers is your proof." },
    ],
  },
  {
    name: "Content & copywriting", keys: ["content writing", "copywriting", "blog writing", "content marketing"], goal: "write and publish real pieces",
    steps: [
      { title: "Write one 600-word article with a keyword brief (who it is for, the one main point, the keyword)", notes: "Read it aloud once and cut every sentence that does not help the reader." },
      { title: "Write two more and publish them (a blog, LinkedIn or Medium)", notes: "Publishing is the point: a real link is better than a perfect draft." },
    ],
  },
  {
    name: "WordPress", keys: ["wordpress", "elementor", "woocommerce"], goal: "build a small working website",
    steps: [
      { title: "Build a 3-page website (home, about, contact) for a real or sample business", notes: "Use a free theme. Write real text, not placeholder text." },
      { title: "Add a contact form and make it fast (small images, a cache or speed plugin)", notes: "Test the form by sending yourself a message." },
      { title: "Put it online (free hosting or a subdomain) and share the link with 3 people", notes: "The live link goes in this project's links." },
    ],
  },
  {
    name: "Web development", keys: ["html", "css", "javascript", "typescript", "react", "next.js", "node.js", "php", "git"], goal: "build and publish a small project",
    steps: [
      { title: "Build a small page or app from a design you like, without copying the code", notes: "Look at the result, not the code. Get stuck, search, fix." },
      { title: "Add one feature that needs real logic (a form, a filter, a saved list)", notes: "One feature, done properly." },
      { title: "Put the code on GitHub with a README and, if you can, a live link", notes: "The README says what it is and how to run it." },
    ],
  },
  {
    name: "SQL", keys: ["sql", "mysql", "postgresql"], goal: "answer real questions with queries",
    steps: [
      { title: "Answer 10 questions from a public dataset with SQL", notes: "Pick a small free dataset. Keep each query and its answer in a note." },
      { title: "Practise joins: write 3 queries that combine 2 or 3 tables", notes: "Explain in one line what each join does." },
    ],
  },
  {
    name: "Excel & data", keys: ["excel", "power bi", "tableau", "data analysis", "data analytics", "statistics", "python", "pandas"], goal: "turn messy data into clear answers",
    steps: [
      { title: "Clean a real dataset (your own expenses, or a public one)", notes: "Fix dates, remove doubles, give columns clear names." },
      { title: "Build a small dashboard or 3 pivot tables from it", notes: "One chart per question." },
      { title: "Write 3 findings in plain words, with the number behind each", notes: "Written for someone who has never seen the data." },
    ],
  },
  {
    name: "Design", keys: ["graphic design", "canva", "figma", "photoshop", "illustrator", "ui/ux design", "adobe xd"], goal: "design real things people will see",
    steps: [
      { title: "Redesign one real poster or social post that looks weak", notes: "Keep the same message. Show the old and the new side by side." },
      { title: "Make a set of 5 matching social posts for one brand", notes: "Same colours, fonts and style across all five." },
      { title: "Put your best 3 pieces on a portfolio page (Behance, a page on your site or a Google Drive folder)", notes: "The link goes in this project's links." },
    ],
  },
  {
    name: "Video editing", keys: ["video editing", "motion graphics", "capcut"], goal: "finish and publish a short video",
    steps: [
      { title: "Edit a 60-second video with cuts, captions and music", notes: "Use your own clips." },
      { title: "Post it and note the views after 3 days", notes: "What would you change in the first 5 seconds?" },
    ],
  },
  {
    name: "Speaking & English", keys: ["communication", "english", "presentation", "report writing", "teaching"], goal: "use the language and the skill out loud and in writing",
    steps: [
      { title: "Record a 2-minute talk on what you learned and listen back", notes: "Write down 3 things to improve." },
      { title: "Give the talk to one person and ask for 3 comments", notes: "A friend or family member is fine." },
      { title: "Write a short email about your work and ask someone to correct it", notes: "Keep the corrected version and the 3 mistakes you made." },
    ],
  },
  {
    name: "Freelancing", keys: ["freelance", "freelancing", "fiverr", "upwork"], goal: "get ready to win a first client",
    steps: [
      { title: "Write your profile and one service or gig page", notes: "Who you help, with what, and one example of your work." },
      { title: "Write 3 proposals for real jobs and send at least one", notes: "Short, specific to the job, with one question for the client." },
      { title: "Make a simple price list and a checklist of what you need from every client", notes: "So the next client conversation is easy." },
    ],
  },
  {
    name: "Project management", keys: ["project management", "agile", "scrum", "jira", "kanban"], goal: "plan and run something small from start to end",
    steps: [
      { title: "Plan a small real project (an event, a launch, a move) with tasks, owners and dates", notes: "Write the goal in one line first." },
      { title: "Run it for a week with a short written update every day", notes: "What got done, what is blocked, what is next." },
    ],
  },
];

// Used when nothing above fits: one step that fits any subject.
const GENERIC_STEP: PracticeStep = {
  title: "Apply it to one small real problem (yours, a friend's or a local business's)",
  notes: "Choose something small enough to finish in a week. Real beats perfect.",
};

/** Days after the start: the first step, the subject steps (1-3), then the finish of the ladder. */
const REDO_DAY = 2;
const SUBJECT_DAYS = [5, 9, 12];
const LADDER_DAYS = { publish: 14, teach: 17, feedback: 19, profile: 21 };

type Item = { title: string; skills: string[]; takeaway?: string };

/** The subject template(s) that fit an item: by its skills first, then by words in its title. */
export function subjectsFor(item: Item) {
  const names = [...item.skills, ...findSkills(item.title)].map((s) => s.toLowerCase());
  const title = item.title.toLowerCase();
  const hit = (s: Subject) => s.keys.some((k) => names.includes(k) || (k.length > 3 && title.includes(k)));
  return PRACTICE_SUBJECTS.filter(hit);
}

/** The project and its tasks for one finished item. Dates run from `today`; the last one is 21 days later. */
export function practicePlan(item: Item, today: string) {
  const subjects = subjectsFor(item);
  const specific = subjects.flatMap((s) => s.steps).slice(0, SUBJECT_DAYS.length);
  const middle = specific.length ? specific : [GENERIC_STEP];
  const name = `Practice: ${item.title}`.slice(0, 120);
  const goal = (item.takeaway?.trim() || `Use what I learned in “${item.title}” to ${subjects[0]?.goal ?? "make something real"}.`).slice(0, 300);

  const steps: { title: string; notes: string; day: number }[] = [
    { title: `Redo one exercise from “${item.title}” without watching the video`.slice(0, 200), notes: "If you get stuck, note exactly where. That is the part to learn again.", day: REDO_DAY },
    ...middle.map((s, i) => ({ ...s, day: SUBJECT_DAYS[i] })),
    { title: "Publish your proof: add the link, a screenshot or a short report to this project's links", notes: "Proof is what turns learning into experience a client or employer can see.", day: LADDER_DAYS.publish },
    { title: "Teach it back: write 10 lines about what you learned (a note, a post or a message to a friend)", notes: "If you cannot explain it simply, read that part again.", day: LADDER_DAYS.teach },
    { title: "Get feedback from one person who knows the subject", notes: "Ask: what is good, and what is the one thing to improve?", day: LADDER_DAYS.feedback },
    { title: "Add it to your CV, LinkedIn and skills, with the proof link", notes: "Use the CV line from the Learning library.", day: LADDER_DAYS.profile },
  ];
  return {
    project: { name, kind: "other" as const, status: "active" as const, color: "emerald" as const, goal, start_date: today, due_date: addDays(today, LADDER_DAYS.profile) },
    tasks: steps.map((s) => ({ title: s.title.slice(0, 200), notes: s.notes.slice(0, 2000), due_date: addDays(today, s.day), priority: "medium" as const })),
  };
}
