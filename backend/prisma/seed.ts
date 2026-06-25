import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  await prisma.platformConfig.upsert({
    where: { id: 'default' },
    update: {
      requireKycForPayouts: true,
      tpRewardUsd: 5,
      riskPercent: 5,
    },
    create: {
      id: 'default',
      registrationFeeUsdt: 5,
      traderPayoutPercent: 40,
      platformPayoutPercent: 60,
      riskPercent: 5,
      startingBalance: 1000,
      winPoints: 10,
      lossPoints: -5,
      duplicateThreshold: 0.9,
      entryTolerancePercent: 0.2,
      tpRewardUsd: 5,
      requireKycForPayouts: true,
    },
  });

  await prisma.virtualAccount.updateMany({
    data: {
      riskPercent: 5,
      maxRiskPerTrade: 50,
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
            maxRiskPerTrade: 50,
            riskPercent: 5,
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
