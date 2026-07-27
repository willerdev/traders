"use client";

import { Contract, JsonRpcProvider, type InterfaceAbi } from "ethers";
import DemoVaultV2Abi from "../abi/DemoVaultV2.json";
import {
  getChainId,
  getContractAddress,
  getRpcUrl,
  isContractConfigured,
  applyRuntimeContractConfig,
} from "../config/contract";

export type PreflightStatus = "pending" | "running" | "pass" | "fail";

export type PreflightCheck = {
  id: string;
  label: string;
  detail?: string;
  status: PreflightStatus;
};

export type PreflightResult = {
  ok: boolean;
  checks: PreflightCheck[];
  address: string;
};

function baseChecks(): PreflightCheck[] {
  return [
    {
      id: "address",
      label: "Vault address configured",
      status: "pending",
    },
    {
      id: "format",
      label: "Address format is valid",
      status: "pending",
    },
    {
      id: "rpc",
      label: "Polygon Amoy RPC reachable",
      status: "pending",
    },
    {
      id: "bytecode",
      label: "Contract bytecode at address",
      status: "pending",
    },
      { id: "vault", label: "Responds as investment vault", status: "pending" },
      {
        id: "snapshot",
        label: "On-chain stats readable",
        status: "pending",
      },
  ];
}

function set(
  checks: PreflightCheck[],
  id: string,
  status: PreflightStatus,
  detail?: string,
) {
  return checks.map((c) =>
    c.id === id ? { ...c, status, detail: detail ?? c.detail } : c,
  );
}

/**
 * Run readiness checks before showing the live dashboard.
 * Failures stay on the checklist UI — dashboard only loads when all pass.
 */
export async function runVaultPreflight(opts?: {
  onUpdate?: (checks: PreflightCheck[]) => void;
}): Promise<PreflightResult> {
  const emit = (checks: PreflightCheck[]) => opts?.onUpdate?.(checks);
  let checks = baseChecks();
  emit(checks);

  // Load optional API config first so address can come from DEMO_VAULT_ADDRESS
  try {
    applyRuntimeContractConfig({
      contractAddress: process.env.NEXT_PUBLIC_CONTRACT_ADDRESS,
      chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID || 80002),
      rpc: process.env.NEXT_PUBLIC_RPC_URL,
      explorerUrl: process.env.NEXT_PUBLIC_EXPLORER_URL,
    });
    const res = await fetch("/api/v1/blockchain/contract/config");
    if (res.ok) {
      const cfg = (await res.json()) as {
        contractAddress?: string;
        explorerBaseUrl?: string;
        rpc?: string;
        chainId?: number;
        configured?: boolean;
      };
      if (cfg.configured && cfg.contractAddress) {
        applyRuntimeContractConfig({
          contractAddress: cfg.contractAddress,
          explorerUrl: cfg.explorerBaseUrl,
          rpc: cfg.rpc,
          chainId: cfg.chainId,
        });
      }
    }
  } catch {
    /* env-only path */
  }

  const address = getContractAddress();

  // 1 — address configured
  checks = set(checks, "address", "running");
  emit(checks);
  if (!isContractConfigured() || !address) {
    checks = set(
      checks,
      "address",
      "fail",
      "Set NEXT_PUBLIC_CONTRACT_ADDRESS (web) and DEMO_VAULT_ADDRESS (API) to the Vault deploy address, then redeploy.",
    );
    checks = checks.map((c) =>
      c.status === "pending" ? { ...c, status: "fail", detail: "Skipped" } : c,
    );
    emit(checks);
    return { ok: false, checks, address: address || "" };
  }
  checks = set(
    checks,
    "address",
    "pass",
    `${address.slice(0, 6)}…${address.slice(-4)}`,
  );
  emit(checks);

  // 2 — format
  checks = set(checks, "format", "running");
  emit(checks);
  const validFormat =
    /^0x[a-fA-F0-9]{40}$/.test(address) &&
    address.toLowerCase() !==
      "0x0000000000000000000000000000000000000000";
  if (!validFormat) {
    checks = set(checks, "format", "fail", "Expected 0x + 40 hex characters");
    checks = checks.map((c) =>
      c.status === "pending" ? { ...c, status: "fail", detail: "Skipped" } : c,
    );
    emit(checks);
    return { ok: false, checks, address };
  }
  checks = set(checks, "format", "pass");
  emit(checks);

  // 3 — RPC
  checks = set(checks, "rpc", "running");
  emit(checks);
  let provider: JsonRpcProvider;
  try {
    provider = new JsonRpcProvider(getRpcUrl(), getChainId(), {
      staticNetwork: true,
    });
    const block = await provider.getBlockNumber();
    checks = set(checks, "rpc", "pass", `Block ${block}`);
    emit(checks);
  } catch (e) {
    checks = set(
      checks,
      "rpc",
      "fail",
      e instanceof Error ? e.message : "RPC unreachable",
    );
    checks = checks.map((c) =>
      c.status === "pending" ? { ...c, status: "fail", detail: "Skipped" } : c,
    );
    emit(checks);
    return { ok: false, checks, address };
  }

  // 4 — bytecode
  checks = set(checks, "bytecode", "running");
  emit(checks);
  try {
    const code = await provider.getCode(address);
    if (!code || code === "0x") {
      checks = set(
        checks,
        "bytecode",
        "fail",
        "No contract at this address on Polygon Amoy",
      );
      checks = checks.map((c) =>
        c.status === "pending" ? { ...c, status: "fail", detail: "Skipped" } : c,
      );
      emit(checks);
      return { ok: false, checks, address };
    }
    checks = set(
      checks,
      "bytecode",
      "pass",
      `${Math.max(0, (code.length - 2) / 2)} bytes`,
    );
    emit(checks);
  } catch (e) {
    checks = set(
      checks,
      "bytecode",
      "fail",
      e instanceof Error ? e.message : "Code lookup failed",
    );
    checks = checks.map((c) =>
      c.status === "pending" ? { ...c, status: "fail", detail: "Skipped" } : c,
    );
    emit(checks);
    return { ok: false, checks, address };
  }

  // 5 — vault ABI (getUserInfo + dailyRate + contractBalance)
  checks = set(checks, "vault", "running");
  emit(checks);
  const contract = new Contract(
    address,
    DemoVaultV2Abi as InterfaceAbi,
    provider,
  );
  try {
    const [owner, rate, bal] = await Promise.all([
      contract.owner(),
      contract.dailyRate(),
      contract.contractBalance(),
    ]);
    checks = set(
      checks,
      "vault",
      "pass",
      `owner ${String(owner).slice(0, 6)}… · dailyRate ${rate}`,
    );
    emit(checks);
    void bal;
  } catch {
    checks = set(
      checks,
      "vault",
      "fail",
      "Wrong contract / ABI — deploy this vault and set the Deploy receipt address",
    );
    checks = checks.map((c) =>
      c.status === "pending" ? { ...c, status: "fail", detail: "Skipped" } : c,
    );
    emit(checks);
    return { ok: false, checks, address };
  }

  // 6 — snapshot reads
  checks = set(checks, "snapshot", "running");
  emit(checks);
  try {
    const [deposited, users, withdrawn, rewardsPaid] = await Promise.all([
      contract.totalDeposited(),
      contract.userCount(),
      contract.totalWithdrawn(),
      contract.totalRewardsPaid(),
    ]);
    checks = set(
      checks,
      "snapshot",
      "pass",
      `users ${users} · deposited readable`,
    );
    emit(checks);
    void deposited;
    void withdrawn;
    void rewardsPaid;
  } catch (e) {
    checks = set(
      checks,
      "snapshot",
      "fail",
      e instanceof Error ? e.message : "Could not read vault stats",
    );
    emit(checks);
    return { ok: false, checks, address };
  }

  return { ok: true, checks, address };
}
