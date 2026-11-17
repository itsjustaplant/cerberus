import { InputError } from "./validation.server";

// Reserve 10% of the account's Standard-class free allowance for overhead.
export const R2_OPERATION_LIMITS = { A: 900_000, B: 9_000_000 } as const;

export class R2BudgetError extends InputError {
  constructor(
    message = "The monthly storage operation budget is exhausted. Try again next month; deletion is still available.",
  ) {
    super(message, 503);
  }
}

export async function reserveR2Operation(
  env: Env,
  operationClass: "A" | "B",
  now = new Date(),
) {
  try {
    const row = await env.DB.prepare(
      `INSERT INTO r2_operation_usage (month, class, operations) VALUES (?, ?, 1)
       ON CONFLICT(month, class) DO UPDATE SET operations = operations + 1
       WHERE operations < ? RETURNING operations`,
    )
      .bind(
        now.toISOString().slice(0, 7),
        operationClass,
        R2_OPERATION_LIMITS[operationClass],
      )
      .first();
    if (!row) throw new R2BudgetError();
  } catch (error) {
    if (error instanceof R2BudgetError) throw error;
    throw new R2BudgetError(
      "Storage usage accounting is unavailable. Reads and uploads are blocked until it recovers; deletion is still available.",
    );
  }
}

export function withR2Budget(env: Env): Env {
  const bucket = new Proxy(env.FILES, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (typeof value !== "function") return value;
      // R2 Standard DELETE operations are free, so cleanup must never be blocked.
      if (property === "delete") return value.bind(target);
      const operationClass =
        property === "put" || property === "list"
          ? "A"
          : property === "get" || property === "head"
            ? "B"
            : null;
      return async (...args: unknown[]) => {
        // New R2 APIs need an explicit budget classification before they can be used.
        if (!operationClass)
          throw new R2BudgetError(
            "This storage operation has no configured usage budget.",
          );
        await reserveR2Operation(env, operationClass);
        return value.apply(target, args);
      };
    },
  });
  return { ...env, FILES: bucket };
}
