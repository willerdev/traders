/**
 * Smart Invest lifetime report — deposits, profits, redemptions, fees per enrolled user.
 *
 * Usage:
 *   cd backend && npx tsx scripts/smart-invest-lifetime-report.ts
 *   cd backend && npx tsx scripts/smart-invest-lifetime-report.ts --user email@example.com
 *   cd backend && npx tsx scripts/smart-invest-lifetime-report.ts --json
 *   cd backend && npm run report:smart-invest
 */
import { PrismaClient, WalletTxType } from '@prisma/client';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnv() {
  const envPath = resolve(__dirname, '../.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const prisma = new PrismaClient();

const PROFIT_TYPES: WalletTxType[] = ['INVESTOR_EARNING'];
const REDEEM_TYPES: WalletTxType[] = ['INVESTOR_REDEEM'];
const FEE_TYPES: WalletTxType[] = ['INVESTOR_FEE', 'INVESTOR_REINVEST_FEE'];
const WITHDRAW_TYPES: WalletTxType[] = ['DEPOSITOR_WITHDRAW'];

const INVEST_ADMIN_PATTERN =
  /smart invest|investor|investment|enrollment fee|enrollment commission|invest/i;

type TxRow = {
  id: string;
  date: string;
  type: WalletTxType;
  amount: number;
  displayAmount: number;
  description: string;
};

type UserReport = {
  userId: string;
  email: string;
  displayName: string | null;
  investorActive: boolean;
  enrolledAt: string | null;
  deposits: TxRow[];
  profits: TxRow[];
  redemptions: TxRow[];
  fees: TxRow[];
  withdrawals: TxRow[];
  totals: {
    deposited: number;
    earned: number;
    redeemed: number;
    fees: number;
    withdrawn: number;
    currentInvestorBalance: number;
    currentWalletBalance: number;
  };
};

function parseArgs() {
  const args = process.argv.slice(2);
  let userEmail: string | undefined;
  let json = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') {
      json = true;
    } else if (arg === '--user') {
      userEmail = args[i + 1];
      i++;
    } else if (arg.startsWith('--user=')) {
      userEmail = arg.slice('--user='.length);
    } else if (!arg.startsWith('-')) {
      userEmail = arg;
    }
  }

  return { userEmail, json };
}

function fmt(n: number) {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function positiveAmount(amount: number) {
  return Math.abs(amount);
}

function isInvestAdminCredit(type: WalletTxType, description: string) {
  if (type === 'DEPOSIT') return true;
  if (type === 'ADJUSTMENT') return INVEST_ADMIN_PATTERN.test(description);
  return false;
}

function classifyDeposit(tx: {
  id: string;
  type: WalletTxType;
  amount: unknown;
  description: string;
  createdAt: Date;
}): TxRow | null {
  const amount = Number(tx.amount);
  if (tx.type === 'DEPOSITOR_DEPOSIT' && amount > 0) {
    return {
      id: tx.id,
      date: fmtDate(tx.createdAt),
      type: tx.type,
      amount,
      displayAmount: amount,
      description: tx.description,
    };
  }
  if (tx.type === 'INVESTOR_ALLOCATE') {
    return {
      id: tx.id,
      date: fmtDate(tx.createdAt),
      type: tx.type,
      amount,
      displayAmount: positiveAmount(amount),
      description: tx.description,
    };
  }
  if (isInvestAdminCredit(tx.type, tx.description) && amount > 0) {
    return {
      id: tx.id,
      date: fmtDate(tx.createdAt),
      type: tx.type,
      amount,
      displayAmount: amount,
      description: tx.description,
    };
  }
  return null;
}

function toTxRow(tx: {
  id: string;
  type: WalletTxType;
  amount: unknown;
  description: string;
  createdAt: Date;
}): TxRow {
  const amount = Number(tx.amount);
  return {
    id: tx.id,
    date: fmtDate(tx.createdAt),
    type: tx.type,
    amount,
    displayAmount: positiveAmount(amount),
    description: tx.description,
  };
}

async function buildUserReport(user: {
  id: string;
  email: string;
  displayName: string | null;
  investorActive: boolean;
  investorEnrolledAt: Date | null;
  platformWallet: { availableBalance: unknown; investorBalance: unknown } | null;
}): Promise<UserReport> {
  const txs = await prisma.walletTransaction.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      type: true,
      amount: true,
      description: true,
      createdAt: true,
    },
  });

  const deposits = txs
    .map(classifyDeposit)
    .filter((row): row is TxRow => row !== null);

  const profits = txs
    .filter((tx) => PROFIT_TYPES.includes(tx.type))
    .map(toTxRow);

  const redemptions = txs
    .filter((tx) => REDEEM_TYPES.includes(tx.type))
    .map(toTxRow);

  const fees = txs.filter((tx) => FEE_TYPES.includes(tx.type)).map(toTxRow);

  const withdrawals = txs
    .filter((tx) => WITHDRAW_TYPES.includes(tx.type))
    .map(toTxRow);

  const totalDeposited = deposits.reduce((s, t) => s + t.displayAmount, 0);
  const totalEarned = profits.reduce((s, t) => s + t.displayAmount, 0);
  const totalRedeemed = redemptions.reduce((s, t) => s + t.displayAmount, 0);
  const totalFees = fees.reduce((s, t) => s + t.displayAmount, 0);
  const totalWithdrawn = withdrawals.reduce((s, t) => s + t.displayAmount, 0);

  return {
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
    investorActive: user.investorActive,
    enrolledAt: user.investorEnrolledAt?.toISOString() ?? null,
    deposits,
    profits,
    redemptions,
    fees,
    withdrawals,
    totals: {
      deposited: Math.round(totalDeposited * 100) / 100,
      earned: Math.round(totalEarned * 100) / 100,
      redeemed: Math.round(totalRedeemed * 100) / 100,
      fees: Math.round(totalFees * 100) / 100,
      withdrawn: Math.round(totalWithdrawn * 100) / 100,
      currentInvestorBalance: Number(user.platformWallet?.investorBalance ?? 0),
      currentWalletBalance: Number(user.platformWallet?.availableBalance ?? 0),
    },
  };
}

function printSeparator(char = '=', width = 100) {
  console.log(char.repeat(width));
}

function printTable(title: string, rows: TxRow[], emptyLabel: string) {
  console.log(`\n  ${title}`);
  if (rows.length === 0) {
    console.log(`    (${emptyLabel})`);
    return 0;
  }

  const dateW = 19;
  const typeW = 22;
  const amtW = 12;
  console.log(
    `    ${'Date'.padEnd(dateW)} ${'Type'.padEnd(typeW)} ${'Amount'.padStart(amtW)}  Description`,
  );
  console.log(`    ${'-'.repeat(dateW)} ${'-'.repeat(typeW)} ${'-'.repeat(amtW)}  ${'-'.repeat(40)}`);

  let sum = 0;
  for (const row of rows) {
    sum += row.displayAmount;
    const desc =
      row.description.length > 52
        ? `${row.description.slice(0, 49)}...`
        : row.description;
    console.log(
      `    ${row.date.padEnd(dateW)} ${row.type.padEnd(typeW)} $${fmt(row.displayAmount).padStart(amtW - 1)}  ${desc}`,
    );
  }
  console.log(`    ${''.padEnd(dateW)} ${'SUBTOTAL'.padEnd(typeW)} $${fmt(sum).padStart(amtW - 1)}`);
  return sum;
}

function printUserReport(report: UserReport, index: number, total: number) {
  printSeparator();
  console.log(
    `[${index}/${total}] ${report.email}${report.displayName ? ` (${report.displayName})` : ''}`,
  );
  console.log(`  User ID:       ${report.userId}`);
  console.log(
    `  Enrolled:      ${report.enrolledAt ? report.enrolledAt.slice(0, 10) : '—'}  |  Active: ${report.investorActive ? 'yes' : 'no'}`,
  );

  printTable('DEPOSITS (wallet + admin credits + allocations)', report.deposits, 'none');
  printTable('PROFITS (INVESTOR_EARNING daily credits)', report.profits, 'none');
  printTable('REDEMPTIONS (INVESTOR_REDEEM)', report.redemptions, 'none');
  printTable('FEES (INVESTOR_FEE + INVESTOR_REINVEST_FEE)', report.fees, 'none');
  printTable('WITHDRAWALS (DEPOSITOR_WITHDRAW)', report.withdrawals, 'none');

  console.log('\n  TOTALS');
  console.log(`    Total deposited:          $${fmt(report.totals.deposited)}`);
  console.log(`    Total earned (profits):   $${fmt(report.totals.earned)}`);
  console.log(`    Total redeemed:           $${fmt(report.totals.redeemed)}`);
  console.log(`    Total fees:               $${fmt(report.totals.fees)}`);
  console.log(`    Total withdrawn:          $${fmt(report.totals.withdrawn)}`);
  console.log(`    Current investor balance: $${fmt(report.totals.currentInvestorBalance)}`);
  console.log(`    Current wallet balance:   $${fmt(report.totals.currentWalletBalance)}`);
}

function printGrandSummary(reports: UserReport[]) {
  const grand = reports.reduce(
    (acc, r) => ({
      deposited: acc.deposited + r.totals.deposited,
      earned: acc.earned + r.totals.earned,
      redeemed: acc.redeemed + r.totals.redeemed,
      fees: acc.fees + r.totals.fees,
      withdrawn: acc.withdrawn + r.totals.withdrawn,
      investorBalance: acc.investorBalance + r.totals.currentInvestorBalance,
      walletBalance: acc.walletBalance + r.totals.currentWalletBalance,
    }),
    {
      deposited: 0,
      earned: 0,
      redeemed: 0,
      fees: 0,
      withdrawn: 0,
      investorBalance: 0,
      walletBalance: 0,
    },
  );

  printSeparator('*');
  console.log(`GRAND SUMMARY — ${reports.length} Smart Invest user(s)`);
  console.log(`  Total deposited:          $${fmt(grand.deposited)}`);
  console.log(`  Total earned (profits):   $${fmt(grand.earned)}`);
  console.log(`  Total redeemed:           $${fmt(grand.redeemed)}`);
  console.log(`  Total fees:               $${fmt(grand.fees)}`);
  console.log(`  Total withdrawn:          $${fmt(grand.withdrawn)}`);
  console.log(`  Current investor balance: $${fmt(grand.investorBalance)}`);
  console.log(`  Current wallet balance:   $${fmt(grand.walletBalance)}`);
  printSeparator('*');
}

async function main() {
  const { userEmail, json } = parseArgs();

  const where = {
    OR: [{ investorActive: true }, { investorEnrolledAt: { not: null } }],
    ...(userEmail
      ? { email: { equals: userEmail, mode: 'insensitive' as const } }
      : {}),
  };

  const users = await prisma.user.findMany({
    where,
    orderBy: [{ investorEnrolledAt: 'asc' }, { email: 'asc' }],
    select: {
      id: true,
      email: true,
      displayName: true,
      investorActive: true,
      investorEnrolledAt: true,
      platformWallet: {
        select: { availableBalance: true, investorBalance: true },
      },
    },
  });

  if (users.length === 0) {
    throw new Error(
      userEmail
        ? `No Smart Invest user found for email: ${userEmail}`
        : 'No Smart Invest users found',
    );
  }

  const reports: UserReport[] = [];
  for (const user of users) {
    reports.push(await buildUserReport(user));
  }

  if (json) {
    console.log(
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          userCount: reports.length,
          users: reports,
          grandTotals: reports.reduce(
            (acc, r) => ({
              deposited: acc.deposited + r.totals.deposited,
              earned: acc.earned + r.totals.earned,
              redeemed: acc.redeemed + r.totals.redeemed,
              fees: acc.fees + r.totals.fees,
              withdrawn: acc.withdrawn + r.totals.withdrawn,
              currentInvestorBalance:
                acc.currentInvestorBalance + r.totals.currentInvestorBalance,
              currentWalletBalance:
                acc.currentWalletBalance + r.totals.currentWalletBalance,
            }),
            {
              deposited: 0,
              earned: 0,
              redeemed: 0,
              fees: 0,
              withdrawn: 0,
              currentInvestorBalance: 0,
              currentWalletBalance: 0,
            },
          ),
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log('Smart Invest Lifetime Report');
  console.log(`Generated: ${fmtDate(new Date())} UTC`);
  console.log(`Scope: investorActive OR investorEnrolledAt set (${reports.length} user(s))`);

  reports.forEach((report, i) => printUserReport(report, i + 1, reports.length));

  if (reports.length > 1) {
    printGrandSummary(reports);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
