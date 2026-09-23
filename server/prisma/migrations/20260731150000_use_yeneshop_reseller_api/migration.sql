-- Suq now buys exclusively through YeneShop's ETB-denominated reseller API.
-- Preserve all existing customer/order history while making the supplier
-- semantics explicit in the persisted model.

CREATE TYPE "ProductSource_new" AS ENUM ('YENESHOP', 'MANUAL');

ALTER TABLE "products" ALTER COLUMN "source" DROP DEFAULT;
ALTER TABLE "products"
  ALTER COLUMN "source" TYPE "ProductSource_new"
  USING (CASE WHEN "source"::text = 'HUBX' THEN 'YENESHOP' ELSE "source"::text END)::"ProductSource_new";
DROP TYPE "ProductSource";
ALTER TYPE "ProductSource_new" RENAME TO "ProductSource";

CREATE TYPE "ProductDeliveryType" AS ENUM ('INSTANT', 'MANUAL');

ALTER TABLE "products"
  RENAME COLUMN "costPriceUSDT" TO "costPriceETB";

ALTER TABLE "products"
  ADD COLUMN "suggestedRetailPriceETB" DECIMAL(18,2),
  ADD COLUMN "imageUrl" TEXT,
  ADD COLUMN "deliveryType" "ProductDeliveryType" NOT NULL DEFAULT 'INSTANT';

-- Historical Suq rows used a USDT supplier. Their old converted retail price
-- is the safest fallback until the first YeneShop catalogue refresh replaces
-- the row with authoritative ETB prices.
UPDATE "products"
SET "suggestedRetailPriceETB" = "sellingPriceETB";

ALTER TABLE "products"
  ALTER COLUMN "suggestedRetailPriceETB" SET NOT NULL;

ALTER TABLE "orders"
  RENAME COLUMN "costUSDT" TO "costETB";

ALTER TABLE "orders"
  ALTER COLUMN "costETB" TYPE DECIMAL(18,2);

ALTER TABLE "orders"
  RENAME COLUMN "hubxOrderId" TO "yeneshopOrderId";

ALTER TABLE "money_events"
  RENAME COLUMN "costUSDT" TO "costETB";

ALTER TABLE "money_events"
  ALTER COLUMN "costETB" TYPE DECIMAL(18,2);

ALTER TABLE "products"
  ALTER COLUMN "source" SET DEFAULT 'YENESHOP';
