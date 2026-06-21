import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  await prisma.platformConfig.upsert({
    where: { id: 'default' },
    update: { requireKycForPayouts: true },
    create: {
      id: 'default',
      registrationFeeUsdt: 5,
      traderPayoutPercent: 40,
      platformPayoutPercent: 60,
      riskPercent: 2,
      startingBalance: 1000,
      winPoints: 10,
      lossPoints: -5,
      duplicateThreshold: 0.9,
      entryTolerancePercent: 0.2,
      tpRewardUsd: 10,
      requireKycForPayouts: true,
    },
  });

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@traderrank.pro';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!ChangeMe';

  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        displayName: 'Platform Admin',
        role: 'ADMIN',
        status: 'ACTIVE',
        emailVerified: true,
        registrationPaid: true,
        termsAcceptedAt: new Date(),
        virtualAccount: {
          create: {
            balance: 1000,
            maxRiskPerTrade: 20,
            riskPercent: 2,
          },
        },
      },
    });
    console.log(`Admin user created: ${adminEmail}`);
  } else if (existingAdmin.role !== 'ADMIN') {
    await prisma.user.update({
      where: { email: adminEmail },
      data: { role: 'ADMIN', status: 'ACTIVE' },
    });
    console.log(`Promoted ${adminEmail} to ADMIN`);
  }

  console.log('Platform config seeded');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
