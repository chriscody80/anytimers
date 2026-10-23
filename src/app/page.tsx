import { redirect } from "next/navigation";
import { myCrews } from "@/lib/data";

// Sends you straight to your crew when you only have one; otherwise to the crew list.
export default async function Home() {
  const crews = await myCrews();
  if (crews.length === 0) redirect("/start");
  if (crews.length === 1) redirect(`/c/${crews[0].id}`);
  redirect("/crews");
}
