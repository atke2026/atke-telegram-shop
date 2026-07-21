-- CreateEnum
CREATE TYPE "DiscountScope" AS ENUM ('ALL', 'PRODUCT');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENT', 'FIXED');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "discountETB" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "discountId" TEXT,
ADD COLUMN     "listPriceETB" DECIMAL(18,2);

-- CreateTable
CREATE TABLE "discounts" (
    "id" TEXT NOT NULL,
    "scope" "DiscountScope" NOT NULL,
    "productId" TEXT,
    "type" "DiscountType" NOT NULL,
    "value" DECIMAL(18,2) NOT NULL,
    "label" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdByTelegramId" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "discounts_isActive_scope_idx" ON "discounts"("isActive", "scope");

-- CreateIndex
CREATE INDEX "discounts_productId_idx" ON "discounts"("productId");

-- AddForeignKey
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
