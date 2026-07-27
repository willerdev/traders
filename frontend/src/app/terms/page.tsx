import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms & Conditions | TraderRank Pro",
  description:
    "Platform terms, preferred withdrawal schedule, and early-exit penalties for TraderRank Pro.",
};

const EFFECTIVE = "27 July 2026";

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
        Legal
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
        Terms &amp; Conditions
      </h1>
      <p className="mt-3 text-sm text-gray-400">
        Effective {EFFECTIVE}. By creating an account, depositing, investing, or
        requesting a withdrawal on TraderRank Pro (thetradeguard.com), you agree
        to these Terms.
      </p>

      <nav className="mt-8 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-gray-300">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          On this page
        </p>
        <ul className="space-y-1.5">
          <li>
            <a href="#purpose" className="text-primary hover:underline">
              1. Purpose &amp; stable capital
            </a>
          </li>
          <li>
            <a href="#withdrawals" className="text-primary hover:underline">
              2. Preferred withdrawal schedule
            </a>
          </li>
          <li>
            <a href="#penalties" className="text-primary hover:underline">
              3. Off-schedule / early withdrawals
            </a>
          </li>
          <li>
            <a href="#fees" className="text-primary hover:underline">
              4. Fees, KYC &amp; processing
            </a>
          </li>
          <li>
            <a href="#platform" className="text-primary hover:underline">
              5. Platform protection
            </a>
          </li>
          <li>
            <a href="#risk" className="text-primary hover:underline">
              6. Risk disclosure
            </a>
          </li>
          <li>
            <a href="#changes" className="text-primary hover:underline">
              7. Changes
            </a>
          </li>
          <li>
            <a href="#onchain" className="text-primary hover:underline">
              8. On-chain vault contract
            </a>
          </li>
        </ul>
      </nav>

      <div className="prose-terms mt-10 space-y-10 text-sm leading-relaxed text-gray-300">
        <section id="purpose">
          <h2 className="text-lg font-semibold text-white">
            1. Purpose &amp; stable capital
          </h2>
          <p className="mt-3">
            TraderRank Pro is a talent-discovery and capital-allocation platform.
            Wallet balances, investor allocations, and depositor plans are
            designed for <strong className="text-gray-200">stable, ongoing
            participation</strong> — not day-to-day cash movement. Random or
            frequent withdrawals disrupt yield planning, liquidity management,
            and fair treatment of other participants.
          </p>
          <p className="mt-3">
            By using the platform you agree to withdraw on a{" "}
            <strong className="text-gray-200">preferred cadence</strong>{" "}
            (weekly or monthly, as configured) whenever practicable, and to
            accept documented fees and penalties when you choose to withdraw
            outside that window.
          </p>
        </section>

        <section id="withdrawals">
          <h2 className="text-lg font-semibold text-white">
            2. Preferred withdrawal schedule
          </h2>
          <p className="mt-3">
            Unless the platform announces otherwise in writing or in-product, the
            preferred withdrawal windows are:
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>
              <strong className="text-gray-200">Weekly mode:</strong> Sundays
              (UTC calendar day).
            </li>
            <li>
              <strong className="text-gray-200">Monthly mode:</strong> the 1st of
              each calendar month (UTC).
            </li>
          </ul>
          <p className="mt-3">
            During a preferred window, standard processing fees apply (if any),
            and <strong className="text-gray-200">no off-schedule penalty</strong>{" "}
            is charged. The live Wallet screen shows whether today is inside the
            preferred window and when the next window opens.
          </p>
          <p className="mt-3">
            You are encouraged to plan withdrawals for these windows so capital
            remains productive and you avoid unnecessary penalties.
          </p>
        </section>

        <section id="penalties">
          <h2 className="text-lg font-semibold text-white">
            3. Off-schedule / early withdrawals
          </h2>
          <p className="mt-3">
            Withdrawals outside the preferred window{" "}
            <strong className="text-gray-200">remain available</strong> — the
            platform does not block anytime access to your available wallet
            balance (subject to KYC, compliance, and sufficient funds). Choosing
            an off-schedule withdrawal constitutes an early / discretionary exit
            and incurs an{" "}
            <strong className="text-gray-200">off-schedule penalty</strong> in
            addition to any processing fee.
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>
              Default penalty:{" "}
              <strong className="text-gray-200">8% of the gross withdrawal
              amount</strong> (configurable by the platform; shown before you
              confirm).
            </li>
            <li>
              Penalty and processing fee are deducted from the gross amount; you
              receive the net payout to your saved withdrawal destination.
            </li>
            <li>
              VIP / promotional waivers may reduce or remove the{" "}
              <em>processing</em> fee; they do{" "}
              <strong className="text-gray-200">not</strong> automatically waive
              the off-schedule penalty unless explicitly stated.
            </li>
            <li>
              Penalties and fees are non-refundable once the withdrawal request
              is accepted by the system, except where required by law or where
              the platform cancels a request before settlement.
            </li>
          </ul>
        </section>

        <section id="fees">
          <h2 className="text-lg font-semibold text-white">
            4. Fees, KYC &amp; processing
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>
              A platform processing fee (default{" "}
              <strong className="text-gray-200">$3 USDT</strong> for non-VIP
              users; $0 for eligible VIP) may apply on every wallet withdrawal.
            </li>
            <li>
              Identity verification (KYC) is required before payouts are
              approved or sent. Registration and signal submission do not require
              KYC.
            </li>
            <li>
              Withdrawals are paid to a saved, verified destination (e.g. USDT
              TRC20 or supported mobile-money networks). You are responsible for
              providing a correct address / account.
            </li>
            <li>
              Requests may remain PENDING pending admin or automated review;
              instant settlement applies only where your account is expressly
              enabled for it.
            </li>
            <li>
              Network / gateway fees charged by third parties are outside the
              platform&apos;s control and may reduce the amount that arrives
              on-chain or at a mobile wallet.
            </li>
          </ul>
        </section>

        <section id="platform">
          <h2 className="text-lg font-semibold text-white">
            5. Platform protection
          </h2>
          <p className="mt-3">
            To protect liquidity, other users, and orderly operations, TraderRank
            Pro may:
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>
              Enforce preferred windows, processing fees, and off-schedule
              penalties as displayed at the time of request.
            </li>
            <li>
              Delay, queue, or batch withdrawals during high volume, compliance
              review, or payment-provider outages.
            </li>
            <li>
              Refuse or reverse withdrawals that appear abusive, fraudulent,
              multi-account gaming, or in breach of these Terms.
            </li>
            <li>
              Adjust schedule mode (weekly ↔ monthly), fee amounts, and penalty
              percentages with notice via the product, email, or this page.
            </li>
            <li>
              Suspend accounts that repeatedly abuse off-schedule withdrawals to
              game yield timing or create operational risk.
            </li>
          </ul>
          <p className="mt-3">
            Fees and penalties collected under this policy support platform
            operations, liquidity buffers, and continued product development.
            They are not a guarantee of investment performance.
          </p>
        </section>

        <section id="risk">
          <h2 className="text-lg font-semibold text-white">
            6. Risk disclosure
          </h2>
          <p className="mt-3">
            Trading and capital allocation involve substantial risk of loss.
            Virtual funded accounts, leaderboard rankings, and displayed yields
            do not guarantee real-world profits. Past or illustrated performance
            is not indicative of future results. You alone decide how much to
            allocate and when to withdraw within these Terms.
          </p>
        </section>

        <section id="changes">
          <h2 className="text-lg font-semibold text-white">7. Changes</h2>
          <p className="mt-3">
            We may update these Terms from time to time. Material changes to
            withdrawal cadence or penalty structure will be reflected on this
            page and, where practicable, announced in-product or by email.
            Continued use after the effective date constitutes acceptance.
          </p>
          <p className="mt-3">
            Questions: use <strong className="text-gray-200">Messages → Speak
            to admin</strong> on the platform.
          </p>
        </section>

        <section id="onchain">
          <h2 className="text-lg font-semibold text-white">
            8. On-chain vault contract
          </h2>
          <p className="mt-3">
            The Chain / vault product is a separate enrollment. You must accept
            contract terms, complete document + liveness KYC, and wait for
            approval before depositing. Minimum deposit is{" "}
            <strong className="text-gray-200">$2,000 USDT</strong>. Accounts from
            $2,000–$5,000 have an indicative{" "}
            <strong className="text-gray-200">10%</strong> starting yield band;
            above $5,000 an indicative{" "}
            <strong className="text-gray-200">15%</strong> band. Actual percentage
            may change depending on deposit size, available funds, market
            conditions, and past user behavior. Every withdrawal deducts a{" "}
            <strong className="text-gray-200">5%</strong> fee. The live dashboard
            stays empty until approval; the contract launches only after an
            approved deposit.
          </p>
        </section>
      </div>

      <p className="mt-12 text-center text-sm text-gray-500">
        <Link href="/register" className="text-primary hover:underline">
          Back to register
        </Link>
        {" · "}
        <Link href="/wallet" className="text-primary hover:underline">
          Wallet
        </Link>
        {" · "}
        <Link href="/" className="text-primary hover:underline">
          Home
        </Link>
      </p>
    </div>
  );
}
