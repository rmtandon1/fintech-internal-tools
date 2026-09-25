import { redirect } from "next/navigation";

/** The app panel is the home page now; old links land there. */
export default function AppsPage() {
  redirect("/");
}
