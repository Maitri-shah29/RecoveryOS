import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { canonicalJson } from "@/lib/audit/chain";
import { ApiError } from "@/lib/http/api";

const REMOTE_MUTATION_TIMEOUT_MS = 240_000;

export type MutationResult<T extends Prisma.InputJsonValue = Prisma.InputJsonValue> = { status: number; body: T };

function requestDigest(route: string, requestBody: unknown) {
  return createHash("sha256").update(canonicalJson({ route, requestBody })).digest("hex");
}

export async function readIdempotencyReplay<T extends Prisma.InputJsonValue>(client: PrismaClient, merchantId: string, route: string, idempotencyKey: string, requestBody: unknown): Promise<(MutationResult<T> & { replayed: true }) | null> {
  const requestHash = requestDigest(route, requestBody);
  const existing = await client.idempotencyRecord.findUnique({ where: { merchantId_idempotencyKey: { merchantId, idempotencyKey } } });
  if (!existing) return null;
  if (existing.requestHash !== requestHash || existing.route !== route) throw new ApiError(409, "Idempotency key was already used for a different request.");
  return { status: existing.statusCode, body: existing.response as T, replayed: true };
}

export async function runIdempotentMutation<T extends Prisma.InputJsonValue>(
  client: PrismaClient,
  merchantId: string,
  route: string,
  idempotencyKey: string,
  requestBody: unknown,
  mutation: (tx: Prisma.TransactionClient) => Promise<MutationResult<T>>,
): Promise<MutationResult<T> & { replayed: boolean }> {
  const requestHash = requestDigest(route, requestBody);
  const existing = await readIdempotencyReplay<T>(client, merchantId, route, idempotencyKey, requestBody);
  if (existing) return existing;
  try {
    return await client.$transaction(async (tx) => {
      const result = await mutation(tx);
      await tx.idempotencyRecord.create({ data: { merchantId, route, idempotencyKey, requestHash, statusCode: result.status, response: result.body } });
      return { ...result, replayed: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 30_000, timeout: REMOTE_MUTATION_TIMEOUT_MS });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const replay = await client.idempotencyRecord.findUnique({ where: { merchantId_idempotencyKey: { merchantId, idempotencyKey } } });
      if (replay && replay.requestHash === requestHash && replay.route === route) return { status: replay.statusCode, body: replay.response as T, replayed: true };
    }
    throw error;
  }
}
