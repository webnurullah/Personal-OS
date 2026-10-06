// Finds known skills in a job post by keyword (no AI). The first name in each row is the one shown;
// the others are other ways it is written. Add your own rows: the match is on whole words only.
const SKILLS: string[][] = [
  // Web & software
  ["JavaScript", "javascript", "ecmascript", "es6"], ["TypeScript", "typescript"], ["HTML", "html", "html5"], ["CSS", "css", "css3"],
  ["React", "react", "react.js", "reactjs", "react js"], ["Next.js", "next.js", "nextjs", "next js"], ["Vue.js", "vue", "vue.js", "vuejs"],
  ["Angular", "angular", "angularjs"], ["Svelte", "svelte"], ["Redux", "redux"], ["jQuery", "jquery"], ["Tailwind CSS", "tailwind", "tailwind css", "tailwindcss"],
  ["Bootstrap", "bootstrap"], ["Sass", "sass", "scss"], ["Node.js", "node.js", "nodejs", "node js"], ["Express.js", "express.js", "expressjs"],
  ["NestJS", "nestjs", "nest.js"], ["GraphQL", "graphql"], ["REST API", "rest api", "rest apis", "restful", "restful api", "restful apis"],
  ["PHP", "php"], ["Laravel", "laravel"], ["WordPress", "wordpress"], ["WooCommerce", "woocommerce"], ["Shopify", "shopify"], ["Elementor", "elementor"],
  ["Python", "python"], ["Django", "django"], ["Flask", "flask"], ["FastAPI", "fastapi"], ["Java", "java"], ["Spring Boot", "spring boot", "springboot"],
  ["C#", "c#", "csharp"], [".NET", ".net", "asp.net", "dotnet"], ["C++", "c++"], ["Go", "golang"], ["Rust", "rust"], ["Ruby on Rails", "ruby on rails", "rails", "ruby"],
  ["Kotlin", "kotlin"], ["Flutter", "flutter"], ["Dart", "dart"], ["React Native", "react native"], ["Android", "android"], ["iOS", "ios"],
  ["Git", "git", "github", "gitlab"], ["Docker", "docker"], ["Kubernetes", "kubernetes", "k8s"], ["Linux", "linux", "ubuntu"], ["AWS", "aws", "amazon web services"],
  ["Azure", "azure"], ["Google Cloud", "google cloud", "gcp"], ["CI/CD", "ci/cd", "ci cd", "jenkins", "github actions"], ["Terraform", "terraform"], ["Nginx", "nginx"],
  ["SQL", "sql", "t-sql"], ["MySQL", "mysql"], ["PostgreSQL", "postgresql", "postgres"], ["MongoDB", "mongodb", "mongo"], ["Redis", "redis"], ["Firebase", "firebase"],
  ["Supabase", "supabase"], ["Oracle", "oracle"], ["Microservices", "microservices", "microservice"], ["Testing", "unit testing", "test automation", "automation testing", "jest", "selenium", "cypress"],
  ["Manual Testing", "manual testing", "qa", "quality assurance"], ["Cybersecurity", "cybersecurity", "cyber security", "information security"], ["Networking", "ccna", "cisco", "computer networking", "mikrotik"],
  // Data
  ["Excel", "excel", "ms excel", "microsoft excel", "advanced excel"], ["Power BI", "power bi", "powerbi"], ["Tableau", "tableau"], ["Data Analysis", "data analysis", "data analytics", "data analyst"],
  ["Machine Learning", "machine learning"], ["Deep Learning", "deep learning"], ["TensorFlow", "tensorflow"], ["PyTorch", "pytorch"], ["Pandas", "pandas"], ["NumPy", "numpy"],
  ["Statistics", "statistics", "statistical analysis"], ["Data Entry", "data entry"], ["R", "r programming", "rstudio"],
  // Design & media
  ["Figma", "figma"], ["Photoshop", "photoshop", "adobe photoshop"], ["Illustrator", "illustrator", "adobe illustrator"], ["Adobe XD", "adobe xd"], ["UI/UX Design", "ui/ux", "ux design", "ui design", "user experience", "ui ux"],
  ["Graphic Design", "graphic design", "graphics design"], ["Canva", "canva"], ["Video Editing", "video editing", "premiere pro", "after effects", "capcut"], ["Motion Graphics", "motion graphics"],
  // Marketing & content
  ["SEO", "seo", "search engine optimization"], ["Digital Marketing", "digital marketing"], ["Social Media Marketing", "social media marketing", "social media management", "social media"],
  ["Google Ads", "google ads", "google adwords"], ["Facebook Ads", "facebook ads", "meta ads", "facebook marketing"], ["Email Marketing", "email marketing", "mailchimp"], ["Google Analytics", "google analytics", "ga4"],
  ["Content Writing", "content writing", "content creation", "blog writing"], ["Copywriting", "copywriting", "copywriter"], ["Marketing Strategy", "marketing strategy", "brand management"],
  // Business & office
  ["Microsoft Office", "microsoft office", "ms office", "ms word", "microsoft word", "powerpoint", "ms powerpoint", "office 365"], ["Accounting", "accounting", "bookkeeping"], ["Tally", "tally"], ["QuickBooks", "quickbooks"],
  ["Sales", "sales", "business development"], ["Customer Service", "customer service", "customer support", "client relations"], ["Negotiation", "negotiation"], ["Project Management", "project management", "pmp"],
  ["Agile", "agile", "scrum", "kanban"], ["Jira", "jira"], ["Report Writing", "report writing", "report preparation"], ["Research", "research skills", "market research"], ["Supply Chain", "supply chain", "logistics", "procurement"],
  ["HR Management", "human resource", "human resources", "recruitment", "talent acquisition", "payroll"], ["Banking & Finance", "financial analysis", "financial reporting", "credit analysis"], ["Teaching", "teaching", "tutoring", "curriculum"],
  // People skills & languages
  ["Communication", "communication", "communication skills", "communicate effectively"], ["Teamwork", "teamwork", "team work", "team player", "collaboration"], ["Leadership", "leadership", "team leadership", "team lead"],
  ["Problem Solving", "problem solving", "problem-solving"], ["Time Management", "time management", "multitasking"], ["Critical Thinking", "critical thinking", "analytical skills", "analytical thinking"],
  ["Presentation", "presentation skills", "public speaking"], ["Adaptability", "adaptability", "quick learner", "fast learner"], ["English", "english", "english language"], ["Bangla", "bangla", "bengali"],
];

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

// One pattern per skill: whole words only ("Java" does not match "JavaScript", "R" never matches alone).
const PATTERNS = SKILLS.map(([name, ...aliases]) => ({
  name,
  pattern: new RegExp(`(?<![a-z0-9])(?:${[...aliases].sort((a, b) => b.length - a.length).map(escape).join("|")})(?![a-z0-9])`, "i"),
}));

/** The known skills a job post mentions, in the order they are first mentioned. */
export function findSkills(text: string, limit = 25) {
  return PATTERNS.map((p) => ({ name: p.name, at: text.search(p.pattern) }))
    .filter((hit) => hit.at >= 0)
    .sort((a, b) => a.at - b.at)
    .slice(0, limit)
    .map((hit) => hit.name);
}
