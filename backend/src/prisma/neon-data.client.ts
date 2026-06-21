/**
 * Optional Neon Data API client (PostgREST-compatible).
 * Use for fast read paths or edge/serverless queries when JWT is configured.
 * Primary data access remains Prisma + DATABASE_URL.
 */
export class NeonDataClient {
  private baseUrl: string;
  private jwt: string;

  constructor(baseUrl?: string, jwt?: string) {
    this.baseUrl = (
      baseUrl ||
      process.env.NEON_DATA_API_URL ||
      ""
    ).replace(/\/$/, "");
    this.jwt = jwt || process.env.NEON_DATA_API_JWT || "";
  }

  get isConfigured(): boolean {
    return Boolean(this.baseUrl && this.jwt);
  }

  async query<T>(
    table: string,
    params?: Record<string, string>,
  ): Promise<T> {
    if (!this.isConfigured) {
      throw new Error("Neon Data API is not configured (URL + JWT required)");
    }

    const search = params ? `?${new URLSearchParams(params)}` : "";
    const res = await fetch(`${this.baseUrl}/${table}${search}`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.jwt}`,
      },
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(
        (error as { message?: string }).message || "Neon Data API request failed",
      );
    }

    return res.json();
  }

  async getLeaderboard(limit = 50) {
    return this.query("leaderboard", {
      select: "*",
      order: "rank.asc",
      limit: String(limit),
    });
  }
}

export const neonData = new NeonDataClient();
