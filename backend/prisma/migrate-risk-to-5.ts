import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const LEGACY_RISK = new Prisma.Decimal(2);
const LEGACY_MAX_RISK = new Prisma.Decimal(20);
const NEW_RISK = new Prisma.Decimal(5);
const NEW_MAX_RISK = new Prisma.Decimal(50);

const legacyAccountWhere = {
  OR: [{ riskPercent: LEGACY_RISK }, { maxRiskPerTrade: LEGACY_MAX_RISK }],
};

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const [legacyAccounts, legacyConfig] = await Promise.all([
    prisma.virtualAccount.count({ where: legacyAccountWhere }),
    prisma.platformConfig.count({ where: { riskPercent: LEGACY_RISK } }),
  ]);

  console.log(
    `Legacy risk settings: ${legacyAccounts} account(s), ${legacyConfig} platform config row(s)`,
  );

  if (legacyAccounts === 0 && legacyConfig === 0) {
    console.log('Nothing to migrate — all records already on 5% risk.');
    return;
  }

  if (dryRun) {
    console.log('Dry run only — pass without --dry-run to apply changes.');
    return;
  }

  const [accountResult, configResult] = await Promise.all([
    prisma.virtualAccount.updateMany({
      where: legacyAccountWhere,
      data: {
        riskPercent: NEW_RISK,
        maxRiskPerTrade: NEW_MAX_RISK,
      },
    }),
    prisma.platformConfig.updateMany({
      where: { riskPercent: LEGACY_RISK },
      data: { riskPercent: NEW_RISK },
    }),
  ]);

  console.log(`Updated ${accountResult.count} virtual account(s) → 5% / $50 max`);
  console.log(`Updated ${configResult.count} platform config row(s) → 5%`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
