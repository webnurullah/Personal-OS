// Ready-made course outlines for "New course → Start from a template" and for Job Apply's "make a course" button.
// Each outline is plain text in the same format as "Paste an outline" (lib/outline.ts), so a template is edited like text:
// "Unit …" lines, "- topic | hours" lines. Hours are honest study hours for a beginner, not video lengths.
// `subject` names one of the library's subjects (lib/starter-ideas.ts), so a course and its library items share a subject.
import { ideasFor } from "./starter-ideas.ts";
import { addDays } from "./dates.ts";
import { parseOutline, type Outline } from "./outline.ts";
import { autoPlan, topicsFromOutline } from "./plan.ts";

export type CourseTemplate = {
  key: string;
  subject: string;
  title: string;
  subtitle: string;
  /** Study hours a week this template is meant for (how many weeks it takes follows from it: see `templateWeeks`). */
  weeklyHours: number;
  /** Names of skills (as Job Apply lists them, lower case) this template is the right size for. */
  skills: string[];
  /** Words in a course name that suggest this template. */
  match: RegExp;
  outline: string;
};

export const COURSE_TEMPLATES: CourseTemplate[] = [
  {
    key: "digital-marketing",
    subject: "Digital Marketing",
    title: "Digital Marketing",
    subtitle: "From the basics to a first real campaign",
    weeklyHours: 5,
    skills: ["digital marketing", "online marketing"],
    match: /digital marketing|online marketing|marketing/i,
    outline: `Unit 1: Marketing foundations
- What digital marketing is and its main channels | 1.5h
- Customers, personas and the buyer journey | 2h
- Goals and numbers that matter (KPIs) | 2h
- A one-page marketing plan | 2h
Unit 2: Search engine optimisation (SEO)
- How search engines work | 1.5h
- Keyword research | 3h
- On-page SEO and content | 3h
- Technical SEO basics | 2h
- Links and local SEO (Google Business Profile) | 2h
Unit 3: Content marketing and copywriting
- Content strategy and a content calendar | 2h
- Writing headlines and copy that sell | 3h
- Blogs, video and short-form content | 2h
Unit 4: Social media marketing
- Choosing platforms and building a page | 2h
- Posting plan and community | 2h
- Facebook and Instagram organic reach | 2h
Unit 5: Paid ads
- How ad auctions and budgets work | 2h
- Google Search Ads: first campaign | 4h
- Meta (Facebook) Ads: audiences and creatives | 4h
- Tracking results and improving ads | 2h
Unit 6: Email marketing
- Building a list and a welcome sequence | 3h
- Newsletters and automation basics | 2h
Unit 7: Analytics and reporting
- Google Analytics 4 setup and key reports | 4h
- Conversion tracking and a monthly report | 3h
Unit 8: Portfolio project
- Plan a small campaign for a real or practice business | 2h
- Run it and collect the numbers | 5h
- Write the case study | 2h`,
  },
  {
    key: "web-wordpress",
    subject: "Web & WordPress",
    title: "Web basics and WordPress",
    subtitle: "Build and publish a real website",
    weeklyHours: 6,
    skills: ["wordpress", "elementor", "html", "css", "web development"],
    match: /web|wordpress|html|css|front.?end/i,
    outline: `Unit 1: How the web works
- Browsers, servers, domains and hosting | 1.5h
- Setting up your tools | 1h
Unit 2: HTML
- Structure, headings, links and images | 3h
- Forms and tables | 2h
- Semantic HTML and accessibility | 2h
Unit 3: CSS
- Selectors, colours and fonts | 3h
- Box model, spacing and layout | 3h
- Flexbox and grid | 4h
- Responsive design for phones | 3h
Unit 4: WordPress
- Installing WordPress and the dashboard | 2h
- Themes, pages and menus | 3h
- Elementor page building | 4h
- Plugins, speed and security | 3h
Unit 5: Launch
- Buying a domain and hosting, going live | 2h
- Basic SEO and analytics for the site | 2h
Unit 6: Portfolio project
- Plan the pages and content of a small business site | 2h
- Build and test it | 8h
- Publish it and write what you learned | 2h`,
  },
  {
    key: "excel",
    subject: "Data & Excel",
    title: "Excel for work",
    subtitle: "Spreadsheets you can use at a job",
    weeklyHours: 5,
    skills: ["excel", "microsoft excel", "advanced excel", "spreadsheet", "spreadsheets"],
    match: /excel|spreadsheet/i,
    outline: `Unit 1: Getting around
- The screen, cells, rows and columns | 1h
- Entering, formatting and printing data | 2h
Unit 2: Formulas
- Sums, averages and simple formulas | 2h
- Cell references (relative and absolute) | 2h
- IF, AND, OR and nested logic | 3h
Unit 3: Lookups
- VLOOKUP and XLOOKUP | 3h
- INDEX and MATCH | 2h
Unit 4: Working with data
- Sorting, filtering and tables | 2h
- Cleaning messy data | 3h
- Data validation and conditional formatting | 2h
Unit 5: Pivot tables and charts
- Pivot tables | 4h
- Charts that explain the data | 3h
- A small dashboard | 3h
Unit 6: Practice project
- Pick a real data set (sales, expenses or attendance) | 1h
- Analyse it and build the report | 5h`,
  },
  {
    key: "sql",
    subject: "Data & Excel",
    title: "SQL for data analysis",
    subtitle: "Ask a database questions",
    weeklyHours: 5,
    skills: ["sql", "mysql", "postgresql", "database", "databases"],
    match: /\bsql\b|database|mysql|postgres/i,
    outline: `Unit 1: Databases and tables
- What a database is, tables, rows and keys | 1.5h
- Setting up a practice database | 1.5h
Unit 2: Reading data
- SELECT, WHERE and ORDER BY | 3h
- Filtering with AND, OR, IN and LIKE | 2h
- NULL, DISTINCT and LIMIT | 1.5h
Unit 3: Summarising data
- COUNT, SUM, AVG, MIN and MAX | 2h
- GROUP BY and HAVING | 3h
Unit 4: Joining tables
- INNER JOIN | 3h
- LEFT, RIGHT and FULL JOIN | 3h
- Joining three tables | 2h
Unit 5: Intermediate SQL
- Subqueries | 3h
- CASE expressions | 2h
- Dates, strings and basic window functions | 4h
Unit 6: Writing data
- INSERT, UPDATE and DELETE safely | 2h
- Creating tables and constraints | 2h
Unit 7: Practice project
- Choose a public data set and write 10 questions | 2h
- Answer them with queries and explain the results | 6h`,
  },
  {
    key: "graphic-design",
    subject: "Design",
    title: "Graphic design basics",
    subtitle: "Design posters, posts and a small brand",
    weeklyHours: 5,
    skills: ["graphic design", "canva", "photoshop", "figma", "ui/ux design"],
    match: /design|canva|photoshop|figma|illustrator/i,
    outline: `Unit 1: Design principles
- Layout, alignment and white space | 2h
- Colour and contrast | 2h
- Typography: choosing and pairing fonts | 2h
Unit 2: Tools
- Canva: templates, text and brand kit | 3h
- Photoshop or a free alternative: layers and selections | 4h
- Figma basics: frames and components | 3h
Unit 3: Everyday work
- Social media posts and ad creatives | 3h
- Posters, flyers and print sizes | 3h
- Logos and a simple style guide | 4h
Unit 4: Working with clients
- Understanding a brief and giving a quote | 1.5h
- Presenting work and taking feedback | 1.5h
Unit 5: Portfolio project
- Design a small brand (logo, colours, three posts) | 6h
- Put it into a portfolio page | 3h`,
  },
  {
    key: "freelancing",
    subject: "Freelancing & business",
    title: "Freelancing from zero",
    subtitle: "Find clients, price your work and deliver",
    weeklyHours: 4,
    skills: ["freelancing", "upwork", "fiverr", "client communication"],
    match: /freelanc|upwork|fiverr|client/i,
    outline: `Unit 1: Choose your service
- What you can sell and who buys it | 1.5h
- Reading the market on Upwork and Fiverr | 2h
Unit 2: Your profile and gigs
- Writing a profile that gets opened | 2h
- Portfolio samples | 3h
- A gig page with clear packages | 2h
Unit 3: Getting clients
- Writing proposals that win | 3h
- Cold outreach on LinkedIn and email | 2h
- Interviews and calls | 1.5h
Unit 4: Doing the work
- Scoping, pricing and contracts | 2h
- Communication and deadlines | 1.5h
- Revisions, reviews and repeat clients | 1.5h
Unit 5: Getting paid
- Invoices, payment methods and fees in Bangladesh | 1.5h
- Taxes, records and saving a share | 1.5h`,
  },
  {
    key: "english",
    subject: "English & communication",
    title: "English communication",
    subtitle: "Speak, write and present with confidence",
    weeklyHours: 3,
    skills: ["english", "spoken english", "communication", "ielts", "business english"],
    match: /english|communicat|ielts|speaking/i,
    outline: `Unit 1: Everyday speaking
- Greetings, introductions and small talk | 2h
- Pronunciation and stress | 3h
- Daily 10-minute speaking practice (week 1-4) | 3h
Unit 2: Listening
- Understanding fast speech and accents | 3h
- Taking notes from talks and videos | 2h
Unit 3: Writing
- Clear sentences and paragraphs | 3h
- Professional emails | 3h
- Reports and short proposals | 3h
Unit 4: Work communication
- Meetings, phone calls and interviews | 3h
- Presentations | 3h
- Giving and taking feedback politely | 1.5h
Unit 5: Test and portfolio
- IELTS or interview practice test | 4h
- Record a 3-minute talk and review it | 2h`,
  },
];

/** The template that fits a course name best (by its name, then by its subject), or null. */
export function templateFor(name: string): CourseTemplate | null {
  const text = name.trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  const named = COURSE_TEMPLATES.find((t) => t.title.toLowerCase() === lower || t.key === lower);
  if (named) return named;
  const byWords = COURSE_TEMPLATES.find((t) => t.match.test(text));
  if (byWords) return byWords;
  const subject = ideasFor(text)?.subject;
  return subject ? (COURSE_TEMPLATES.find((t) => t.subject === subject) ?? null) : null;
}

/** The template that is the right size for one skill ("Excel", "SQL"), or null: broad ones such as marketing are too big to learn one missing skill. */
export const templateForSkill = (skill: string): CourseTemplate | null => COURSE_TEMPLATES.find((t) => t.skills.includes(skill.trim().toLowerCase())) ?? null;

/** A small plan for learning one skill that has no template: the basics, a practice project and interview questions (about 20 hours). */
export function skillOutline(skill: string) {
  const name = skill.trim().slice(0, 60) || "the skill";
  return `Unit 1: Basics of ${name}
- What ${name} is and the key ideas | 2h
- Set up the tools to practise ${name} | 1.5h
- Follow one beginner tutorial from start to end | 3h
Unit 2: Practice project
- Choose a small project that uses ${name} | 1h
- Build it | 6h
- Fix problems and write down what you learned | 2h
Unit 3: Interview questions
- Collect 15 common ${name} interview questions | 1.5h
- Answer them aloud and note weak spots | 2h
- Mock interview with a friend or a recording | 1h`;
}

/**
 * How many weeks a template takes at its weekly hours: planned the way the course will be (topics in order, a week filled
 * before the next starts), plus one spare week at the end. Worked out, not written down, so it cannot drift from the outline.
 */
export function templateWeeks(t: Pick<CourseTemplate, "outline" | "weeklyHours">, weeklyHours = t.weeklyHours, outline: Outline = parseOutline(t.outline)) {
  const start = "2026-01-05"; // any Monday: only the count of weeks matters
  const plan = autoPlan({ start_date: start, target_date: addDays(start, 156 * 7 - 1), weekly_plan: [] }, topicsFromOutline(outline), weeklyHours, start);
  return Math.min(156, Math.max(2, plan.lastWeek + 1));
}

/** What a template turns into: the numbers the "New course" form and the tests need. */
export function templateSummary(t: Pick<CourseTemplate, "outline">) {
  const { units, topicCount, hours } = parseOutline(t.outline);
  return { units: units.length, topics: topicCount, hours };
}
