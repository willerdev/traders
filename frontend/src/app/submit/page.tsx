import { redirect } from "next/navigation";

/** Trader setup submission is retired from the product surface — send users to Invest. */
export default function SubmitPage() {
  redirect("/invest");
}
