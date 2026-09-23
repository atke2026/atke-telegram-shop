-- CreateEnum
CREATE TYPE "OrderChannel" AS ENUM ('RETAIL', 'RESELLER');

-- CreateEnum
CREATE TYPE "ResellerStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ResellerEnvironment" AS ENUM ('LIVE', 'SANDBOX');

-- AlterTable
ALTER TABLE "orders"
ADD COLUMN "channel" "OrderChannel" NOT NULL DEFAULT 'RETAIL',
ADD COLUMN "resellerId" TEXT,
ADD COLUMN "resellerExternalId" TEXT;

-- CreateTable
CREATE TABLE "resellers" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ResellerStatus" NOT NULL DEFAULT 'ACTIVE',
    "sandboxBalanceETB" DECIMAL(18,2) NOT NULL DEFAULT 100000,
    "addedByTelegramId" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resellers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reseller_api_keys" (
    "id" TEXT NOT NULL,
    "resellerId" TEXT NOT NULL,
    "environment" "ResellerEnvironment" NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reseller_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reseller_product_offers" (
    "productId" TEXT NOT NULL,
    "priceETB" DECIMAL(18,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedByTelegramId" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reseller_product_offers_pkey" PRIMARY KEY ("productId")
);

-- CreateTable
CREATE TABLE "reseller_sandbox_orders" (
    "id" TEXT NOT NULL,
    "resellerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "pricePaidETB" DECIMAL(18,2) NOT NULL,
    "customerInput" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'COMPLETED',
    "deliveredItems" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reseller_sandbox_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "resellers_userId_key" ON "resellers"("userId");
CREATE INDEX "resellers_status_createdAt_idx" ON "resellers"("status", "createdAt");
CREATE UNIQUE INDEX "reseller_api_keys_keyHash_key" ON "reseller_api_keys"("keyHash");
CREATE INDEX "reseller_api_keys_resellerId_environment_revokedAt_idx"
ON "reseller_api_keys"("resellerId", "environment", "revokedAt");
-- One usable key per environment. Historical revoked rows remain for audit.
CREATE UNIQUE INDEX "reseller_api_keys_one_active_per_environment"
ON "reseller_api_keys"("resellerId", "environment")
WHERE "revokedAt" IS NULL;
CREATE INDEX "reseller_product_offers_isActive_idx" ON "reseller_product_offers"("isActive");
CREATE UNIQUE INDEX "reseller_sandbox_orders_resellerId_externalId_key"
ON "reseller_sandbox_orders"("resellerId", "externalId");
CREATE INDEX "reseller_sandbox_orders_resellerId_createdAt_idx"
ON "reseller_sandbox_orders"("resellerId", "createdAt");
CREATE INDEX "orders_resellerId_createdAt_idx" ON "orders"("resellerId", "createdAt");
CREATE UNIQUE INDEX "orders_resellerId_resellerExternalId_key"
ON "orders"("resellerId", "resellerExternalId");

-- AddForeignKey
ALTER TABLE "resellers" ADD CONSTRAINT "resellers_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reseller_api_keys" ADD CONSTRAINT "reseller_api_keys_resellerId_fkey"
FOREIGN KEY ("resellerId") REFERENCES "resellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reseller_product_offers" ADD CONSTRAINT "reseller_product_offers_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reseller_sandbox_orders" ADD CONSTRAINT "reseller_sandbox_orders_resellerId_fkey"
FOREIGN KEY ("resellerId") REFERENCES "resellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reseller_sandbox_orders" ADD CONSTRAINT "reseller_sandbox_orders_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_resellerId_fkey"
FOREIGN KEY ("resellerId") REFERENCES "resellers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
