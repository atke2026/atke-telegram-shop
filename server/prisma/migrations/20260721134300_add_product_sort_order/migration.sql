-- AlterTable
ALTER TABLE "products" ADD COLUMN     "sortOrder" INTEGER;

-- CreateIndex
CREATE INDEX "products_sortOrder_idx" ON "products"("sortOrder");
