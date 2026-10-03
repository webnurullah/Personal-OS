import type { Metadata } from "next";
import { CourseView } from "./course-view";

export const metadata: Metadata = { title: "Course tracker" };

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CourseView id={id} />;
}
