import type { PrismaClient } from "@prisma/client";
import { SYNTHETIC_MERCHANT_ID } from "@/lib/config";
import { DEFAULT_POLICY, POLICY_VERSION } from "@/lib/domain/policy";

export async function ensureSyntheticMerchant(client: PrismaClient) {
  const merchant = await client.merchant.upsert({
    where: { id: SYNTHETIC_MERCHANT_ID },
    update: {},
    create: { id: SYNTHETIC_MERCHANT_ID, name: "RecoveryOS Synthetic Merchant" },
  });
  const policy = await client.policyVersion.upsert({
    where: { merchantId_version: { merchantId: merchant.id, version: POLICY_VERSION } },
    update: { isActive: true },
    create: { merchantId: merchant.id, version: POLICY_VERSION, config: DEFAULT_POLICY, isActive: true },
  });
  return { merchant, policy };
}
