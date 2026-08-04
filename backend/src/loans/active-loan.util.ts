import { PrismaClient, type Loan } from '@prisma/client';

export const LOAN_REINVEST_BLOCKED_MESSAGE =
  'You have an open loan. Wallet → investment and auto-reinvest are paused until the loan is repaid.';

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
