import { CrmShell } from "@/components/crm-shell";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function HistoryLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <CrmShell email={user.email ?? "(계정)"}>{children}</CrmShell>;
}
