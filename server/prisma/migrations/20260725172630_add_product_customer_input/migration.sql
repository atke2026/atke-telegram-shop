-- CreateEnum
CREATE TYPE "ProductInputType" AS ENUM ('TEXT', 'NUMBER');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "customerInput" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "inputPlaceholder" TEXT,
ADD COLUMN     "inputType" "ProductInputType";
