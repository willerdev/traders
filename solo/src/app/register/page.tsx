import { redirect } from "next/navigation";

export default function RegisterClosedPage() {
  redirect("/login");
}
