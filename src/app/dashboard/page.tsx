import { redirect } from "next/navigation";

/** Legacy brand lobby URL — brand selection lives on `/workspace`. */
export default function DashboardRedirectPage() {
  redirect("/workspace");
}
