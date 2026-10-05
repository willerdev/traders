/**
 * Generate 30-day investor/platform report PDF with operating expenses deducted.
 * Usage: cd backend && npx tsx scripts/generate-investor-platform-report-pdf.ts
 */
import PDFDocument from 'pdfkit';
import { createWriteStream, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';

const PERIOD_START = '2026-07-31';
const PERIOD_END = '2026-08-30';
const PERIOD_LABEL = '31 Jul 2026 – 30 Aug 2026';
const TIMEZONE = 'Kampala (UTC+3)';

const fmt = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function countRecurringPayments(startIso: string, endIso: string, intervalDays: number): string[] {
  const dates: string[] = [];
  const start = new Date(`${startIso}T12:00:00Z`);
  const end = new Date(`${endIso}T12:00:00Z`);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + intervalDays)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

const TRADING_TX_PER_DAY = 53;
const TRADING_DAYS = 30;
const TRADING_UNIT_COST = 1;
const RECURRING_AMOUNT = 109;
const RECURRING_INTERVAL_DAYS = 3;
const HOSTING_MONTHLY = 1002;

const tradingTotal = TRADING_UNIT_COST * TRADING_TX_PER_DAY * TRADING_DAYS;
const recurringDates = countRecurringPayments(PERIOD_START, PERIOD_END, RECURRING_INTERVAL_DAYS);
const recurringCount = recurringDates.length;
const recurringTotal = RECURRING_AMOUNT * recurringCount;
const hostingTotal = HOSTING_MONTHLY;
const totalExpenses = tradingTotal + recurringTotal + hostingTotal;

const GROSS_COMMISSION = 6188.16;
const SMART_INVEST_COMMISSION = 3393.42;
const BLOCKCHAIN_COMMISSION = 2774.74;
const OTHER_COMMISSION = 20.0;
const NET_PLATFORM_PROFIT = GROSS_COMMISSION - totalExpenses;

const INVESTOR_EARNINGS = 21438.89;
const WITHDRAWALS_GROSS = 28725.1;
const WITHDRAWALS_NET = 27059.81;
const WALLET_DEPOSITS = 24285.0;
const ADMIN_CREDITS = 5980.0;
const CAPITAL_ALLOCATED = 30774.88;
const REDEEMED = 7721.34;

const OUTPUT = resolve(
  __dirname,
  '../../docs/reports/investor-platform-report-2026-07-31-to-2026-08-30.pdf',
);

type Row = { label: string; value: string; note?: string; bold?: boolean; highlight?: string };

function drawTable(doc: PDFKit.PDFDocument, rows: Row[], startY: number): number {
  let y = startY;
  const rowH = 20;

  rows.forEach((row, i) => {
    const bg = row.highlight ?? (i % 2 === 0 ? '#f7fafc' : undefined);
    if (bg) {
      doc.rect(45, y - 3, 520, rowH).fill(bg);
    }

    doc
      .font(row.bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(10)
      .fillColor('#111')
      .text(row.label, 50, y, { width: 300, lineBreak: false })
      .text(row.value, 360, y, { width: 80, align: 'right', lineBreak: false });

    if (row.note) {
      doc.font('Helvetica').fontSize(8).fillColor('#555').text(row.note, 450, y + 1, {
        width: 110,
        lineBreak: false,
      });
    }

    y += rowH;
  });

  return y;
}

function sectionHeader(doc: PDFKit.PDFDocument, title: string, y: number): number {
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#1a365d').text(title, 50, y);
  doc.moveTo(50, y + 16).lineTo(545, y + 16).strokeColor('#cbd5e0').lineWidth(0.5).stroke();
  return y + 28;
}

function generate() {
  mkdirSync(dirname(OUTPUT), { recursive: true });

  const doc = new PDFDocument({
    size: 'A4',
    margin: 50,
    autoFirstPage: true,
    info: {
      Title: `TraderRank Pro — Investor & Platform Report (${PERIOD_LABEL})`,
      Author: 'TraderRank Pro',
      Subject: '30-day investor activity and net platform profit',
    },
  });

  doc.pipe(createWriteStream(OUTPUT));

  doc
    .font('Helvetica-Bold')
    .fontSize(22)
    .fillColor('#1a365d')
    .text('TraderRank Pro', 50, 45)
    .fontSize(16)
    .fillColor('#2d3748')
    .text('Investor & Platform Revenue Report', 50, 72)
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#4a5568')
    .text(`Reporting period: ${PERIOD_LABEL} · ${TIMEZONE}`, 50, 96)
    .text(`Generated: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`, 50, 110);

  doc.rect(50, 128, 495, 52).fill('#edf2f7');
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor('#1a365d')
    .text('Net platform profit (after operating expenses)', 65, 138)
    .font('Helvetica-Bold')
    .fontSize(20)
    .fillColor(NET_PLATFORM_PROFIT >= 0 ? '#276749' : '#c53030')
    .text(`$${fmt(NET_PLATFORM_PROFIT)} USDT`, 65, 156);

  let y = 200;
  y = sectionHeader(doc, 'Executive Summary', y);
  y = drawTable(doc, [
    { label: 'Investor daily earnings', value: `$${fmt(INVESTOR_EARNINGS)}` },
    { label: 'Wallet withdrawals (gross)', value: `$${fmt(WITHDRAWALS_GROSS)}` },
    { label: 'Wallet withdrawals (net paid out)', value: `$${fmt(WITHDRAWALS_NET)}` },
    { label: 'Gross platform commission revenue', value: `$${fmt(GROSS_COMMISSION)}` },
    { label: 'Total operating expenses', value: `−$${fmt(totalExpenses)}` },
    {
      label: 'Net platform profit',
      value: `$${fmt(NET_PLATFORM_PROFIT)}`,
      note: 'after expenses',
      bold: true,
      highlight: '#e6fffa',
    },
  ], y);

  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#718096')
    .text('21 active investors · 12 new enrollments · 274 daily yield credit events', 50, y + 4);
  y += 24;

  y = sectionHeader(doc, 'Investor Activity', y);
  y = drawTable(doc, [
    { label: 'Wallet deposits', value: `$${fmt(WALLET_DEPOSITS)}`, note: '17 txns' },
    { label: 'Admin / support credits', value: `$${fmt(ADMIN_CREDITS)}`, note: '7 txns' },
    { label: 'Capital allocated', value: `$${fmt(CAPITAL_ALLOCATED)}`, note: '43 txns' },
    { label: 'Daily earnings', value: `$${fmt(INVESTOR_EARNINGS)}`, note: '274 txns' },
    { label: 'Redeemed to wallet', value: `$${fmt(REDEEMED)}`, note: '25 txns' },
    { label: 'Withdrawals gross', value: `$${fmt(WITHDRAWALS_GROSS)}`, note: '50 txns' },
    { label: 'Withdrawals net paid out', value: `$${fmt(WITHDRAWALS_NET)}`, note: 'parsed' },
  ], y);
  y += 10;

  y = sectionHeader(doc, 'Gross Platform Commission Revenue', y);
  y = drawTable(doc, [
    { label: 'Smart Invest fees', value: `$${fmt(SMART_INVEST_COMMISSION)}` },
    { label: 'Blockchain program fees', value: `$${fmt(BLOCKCHAIN_COMMISSION)}` },
    { label: 'Trader / registration subs', value: `$${fmt(OTHER_COMMISSION)}` },
    {
      label: 'Total gross commission',
      value: `$${fmt(GROSS_COMMISSION)}`,
      bold: true,
      highlight: '#ebf8ff',
    },
  ], y);

  doc.addPage();

  y = 50;
  y = sectionHeader(doc, 'Operating Expense Breakdown', y);
  y = drawTable(doc, [
    {
      label: 'Trading systems',
      value: `$${fmt(tradingTotal)}`,
      note: `$1×53×30 days`,
    },
    {
      label: 'Recurring payment',
      value: `$${fmt(recurringTotal)}`,
      note: `${recurringCount}× $109`,
    },
    { label: 'Hosting / subscription', value: `$${fmt(hostingTotal)}`, note: 'monthly' },
    {
      label: 'Total operating expenses',
      value: `$${fmt(totalExpenses)}`,
      bold: true,
      highlight: '#fff5f5',
    },
  ], y);

  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#555')
    .text(`Recurring dates (${recurringCount}, every 3 days from 31 Jul):`, 50, y + 4);
  doc.text(recurringDates.join(' · '), 50, y + 16, { width: 495 });
  y += 44;

  y = sectionHeader(doc, 'Net Platform Profit Calculation', y);
  y = drawTable(doc, [
    { label: 'Gross platform commission revenue', value: `$${fmt(GROSS_COMMISSION)}` },
    { label: 'Less: total operating expenses', value: `−$${fmt(totalExpenses)}` },
    {
      label: 'Net platform profit',
      value: `$${fmt(NET_PLATFORM_PROFIT)}`,
      note: 'USDT',
      bold: true,
      highlight: '#e6fffa',
    },
  ], y);
  y += 16;

  y = sectionHeader(doc, 'Methodology & Assumptions', y);
  const notes = [
    `Window: [${PERIOD_START} 00:00, 2026-08-31 00:00) · ${TIMEZONE}.`,
    'Investor scope: investorActive = true OR investorEnrolledAt IS NOT NULL.',
    'Revenue: fee debits from wallet_transactions + withdrawal penalty parsing.',
    `Expenses: trading $1/tx (${TRADING_TX_PER_DAY}/day), recurring $${RECURRING_AMOUNT}/3 days (${recurringCount} in period), hosting $${HOSTING_MONTHLY}/mo.`,
    'Source: Neon flat-pond-23193514 · wallet_transactions + payments.',
  ];
  doc.font('Helvetica').fontSize(9).fillColor('#4a5568');
  notes.forEach((note) => {
    doc.text(`• ${note}`, 55, y, { width: 490 });
    y += 28;
  });

  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#a0aec0')
    .text('TraderRank Pro · Confidential internal report', 50, 770, { align: 'center', width: 495 });

  doc.end();

  return new Promise<void>((resolvePromise, reject) => {
    doc.on('end', () => resolvePromise());
    doc.on('error', reject);
  });
}

generate()
  .then(() => {
    console.log('PDF written:', OUTPUT);
    console.log('');
    console.log('Key figures:');
    console.log('  Gross commission:     $' + fmt(GROSS_COMMISSION));
    console.log('  Trading systems:      $' + fmt(tradingTotal));
    console.log('  Recurring payments:   $' + fmt(recurringTotal) + ` (${recurringCount}× $${RECURRING_AMOUNT})`);
    console.log('  Hosting:              $' + fmt(hostingTotal));
    console.log('  Total expenses:       $' + fmt(totalExpenses));
    console.log('  Net platform profit:  $' + fmt(NET_PLATFORM_PROFIT));
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
