const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
const PLACEHOLDER =
  "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p6ez6kxOEfRkNpDlHlOYIi";

(async () => {
  const total = await p.user.count();
  const demos = await p.user.findMany({
    where: { email: { endsWith: "@nexara.com.mx" } },
    select: {
      email: true,
      roleKey: true,
      passwordHash: true,
      isActive: true,
    },
    orderBy: { email: "asc" },
  });
  const placeholder = demos.filter(
    (u) => !u.passwordHash || u.passwordHash === PLACEHOLDER,
  ).length;
  console.log(
    JSON.stringify(
      {
        total,
        nexaraEmails: demos.length,
        placeholderOrEmpty: placeholder,
        emails: demos.map((u) => ({
          email: u.email,
          roleKey: u.roleKey,
          active: u.isActive,
          needsSeed: !u.passwordHash || u.passwordHash === PLACEHOLDER,
        })),
      },
      null,
      2,
    ),
  );
  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
