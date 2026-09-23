-- CreateEnum
CREATE TYPE "MoneyEventKind" AS ENUM (
    'DEPOSIT_APPROVED',
    'ORDER_PAID',
    'ORDER_COMPLETED',
    'ORDER_REFUNDED',
    'ORDER_CANCELLED_NO_REFUND',
    'ADMIN_BALANCE_ADJUSTMENT',
    'OPENING_BALANCE'
);

-- CreateTable
CREATE TABLE "money_events" (
    "id" TEXT NOT NULL,
    "kind" "MoneyEventKind" NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "userId" TEXT,
    "orderId" TEXT,
    "depositId" TEXT,
    "walletDeltaETB" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "salesETB" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "costUSDT" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "actorTelegramId" BIGINT,
    "estimated" BOOLEAN NOT NULL DEFAULT false,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "money_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "money_events_dedupeKey_key" ON "money_events"("dedupeKey");
CREATE INDEX "money_events_occurredAt_kind_idx" ON "money_events"("occurredAt", "kind");
CREATE INDEX "money_events_userId_occurredAt_idx" ON "money_events"("userId", "occurredAt");
CREATE INDEX "money_events_orderId_idx" ON "money_events"("orderId");
CREATE INDEX "money_events_depositId_idx" ON "money_events"("depositId");

-- AddForeignKey
ALTER TABLE "money_events"
ADD CONSTRAINT "money_events_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "money_events"
ADD CONSTRAINT "money_events_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "orders"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "money_events"
ADD CONSTRAINT "money_events_depositId_fkey"
FOREIGN KEY ("depositId") REFERENCES "deposits"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill exact deposit approvals. reviewedAt is the moment the wallet moved.
INSERT INTO "money_events" (
    "id", "kind", "dedupeKey", "userId", "depositId",
    "walletDeltaETB", "actorTelegramId", "estimated", "occurredAt"
)
SELECT
    'backfill:deposit-approved:' || d."id",
    'DEPOSIT_APPROVED'::"MoneyEventKind",
    'deposit-approved:' || d."id",
    d."userId",
    d."id",
    d."amountETB",
    d."reviewedBy",
    false,
    COALESCE(d."reviewedAt", d."updatedAt")
FROM "deposits" d
WHERE d."status" = 'APPROVED';

-- Every non-pending order in the current system was charged at creation.
INSERT INTO "money_events" (
    "id", "kind", "dedupeKey", "userId", "orderId",
    "walletDeltaETB", "estimated", "occurredAt"
)
SELECT
    'backfill:order-paid:' || o."id",
    'ORDER_PAID'::"MoneyEventKind",
    'order-paid:' || o."id",
    o."userId",
    o."id",
    -o."pricePaidETB",
    false,
    o."createdAt"
FROM "orders" o
WHERE o."status" <> 'PENDING';

-- A legacy row has only updatedAt for settlement/refund time, so those facts
-- remain usable but are labelled estimated in the analytics response.
INSERT INTO "money_events" (
    "id", "kind", "dedupeKey", "userId", "orderId",
    "salesETB", "costUSDT", "estimated", "occurredAt"
)
SELECT
    'backfill:order-completed:' || o."id",
    'ORDER_COMPLETED'::"MoneyEventKind",
    'order-completed:' || o."id",
    o."userId",
    o."id",
    o."pricePaidETB",
    o."costUSDT",
    true,
    o."updatedAt"
FROM "orders" o
WHERE o."status" = 'COMPLETED';

INSERT INTO "money_events" (
    "id", "kind", "dedupeKey", "userId", "orderId",
    "walletDeltaETB", "estimated", "occurredAt"
)
SELECT
    'backfill:order-refunded:' || o."id",
    'ORDER_REFUNDED'::"MoneyEventKind",
    'order-refunded:' || o."id",
    o."userId",
    o."id",
    o."pricePaidETB",
    true,
    o."updatedAt"
FROM "orders" o
WHERE o."status" = 'REFUNDED';

INSERT INTO "money_events" (
    "id", "kind", "dedupeKey", "userId", "orderId",
    "estimated", "occurredAt"
)
SELECT
    'backfill:order-cancelled:' || o."id",
    'ORDER_CANCELLED_NO_REFUND'::"MoneyEventKind",
    'order-cancelled-no-refund:' || o."id",
    o."userId",
    o."id",
    true,
    o."updatedAt"
FROM "orders" o
WHERE o."status" = 'FAILED';

-- Manual balance edits made before the ledger cannot be reconstructed. Add a
-- transparent opening adjustment per affected wallet so the current ledger
-- still reconciles exactly, while the page reports that historical amount.
INSERT INTO "money_events" (
    "id", "kind", "dedupeKey", "userId",
    "walletDeltaETB", "estimated", "occurredAt"
)
SELECT
    'backfill:opening-balance:' || u."id",
    'OPENING_BALANCE'::"MoneyEventKind",
    'opening-balance:' || u."id",
    u."id",
    u."balanceETB" - COALESCE(e."ledgerBalance", 0),
    true,
    u."createdAt"
FROM "users" u
LEFT JOIN (
    SELECT "userId", SUM("walletDeltaETB") AS "ledgerBalance"
    FROM "money_events"
    GROUP BY "userId"
) e ON e."userId" = u."id"
WHERE u."balanceETB" <> COALESCE(e."ledgerBalance", 0);
