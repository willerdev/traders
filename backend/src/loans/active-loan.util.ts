import { PrismaClient, type Loan } from '@prisma/client';

export const LOAN_REINVEST_BLOCKED_MESSAGE =
  'You have an open loan. Wallet → investment and auto-reinvest are paused until the loan is repaid.';

/** Auto-compounding daily earnings into investment is disabled platform-wide. */
export const AUTO_REINVEST_DISABLED_MESSAGE =
  'Auto-reinvest (compounding) is disabled. Daily earnings stay in your wallet — use Wallet → Investment to reinvest manually.';

type PrismaLike = Pick<PrismaClient, 'loan'>;

/** Open / disbursed loan that blocks compounding and new investment allocates. */
export async function findApprovedLoan(
  prisma: PrismaLike,
  userId: string,
): Promise<Loan | null> {
  return prisma.loan.findFirst({
    where: { userId, status: 'APPROVED' },
    orderBy: { approvedAt: 'desc' },
  });
}

export async function hasApprovedLoan(
  prisma: PrismaLike,
  userId: string,
): Promise<boolean> {
  const loan = await findApprovedLoan(prisma, userId);
  return Boolean(loan);
}
