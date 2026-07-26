import { redirect } from "next/navigation";

/** Leaderboard competition is retired from the product surface — send users to Invest. */
export default function LeaderboardPage() {
  redirect("/invest");
}
