-- CreateEnum
CREATE TYPE "ProductSource" AS ENUM ('HUBX', 'MANUAL');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "deliveryMessage" TEXT,
ADD COLUMN     "source" "ProductSource" NOT NULL DEFAULT 'HUBX';
