import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses } from "@/db/schema";
import { getUser } from "@/server/auth.mjs";
import { getAlerts } from "@/server/services.mjs";
import { getLang } from "@/lib/i18n";
import Shell from "@/components/Shell";
import DbError from "@/components/DbError";
import { cookies } from "next/headers";

export default async function AppLayout({ children }) {
  let user;
  try {
    user = await getUser();
  } catch (e) {
    return <DbError reason={e?.message} />;
  }
  if (!user) redirect("/login");

  let business, alertData, lang;
  try {
    [business] = await db.select().from(businesses).where(eq(businesses.id, user.businessId)).limit(1);
    alertData = await getAlerts(user);
    const jar = await cookies();
    lang = getLang(jar.toString());
  } catch (e) {
    return <DbError reason={e?.message} />;
  }

  return (
    <Shell user={user} business={business} alerts={alertData.alerts} lang={lang}>
      {children}
    </Shell>
  );
}
