import { handle } from "@/lib/server/api";
import { runningTimers } from "@/lib/server/project-time";

// Every timer that is running now (projects, courses, certificate courses), for the circles shown on every page.
export const GET = handle(async ({ db }) => runningTimers(db));
