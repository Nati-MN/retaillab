import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { seedDemo } from "../src/server/demo/seedDemo";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const { organizationId } = await seedDemo(db);
    const [stores, months, strategies] = await Promise.all([
      db.store.count({ where: { organizationId } }),
      db.monthlyRevenue.count({ where: { store: { organizationId } } }),
      db.strategy.findMany({ where: { organizationId }, select: { title: true, store: { select: { code: true } } } }),
    ]);
    console.log(`Seeded fictional demo organization: ${stores} stores, ${months} store-months.`);
    console.log("Rule-engine hypotheses:", strategies.map((s) => `${s.store?.code}: ${s.title}`).join(" | "));
    console.log("Demo login: demo@retaillab.example / demo");
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
