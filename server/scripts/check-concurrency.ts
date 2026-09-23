/**
 * Integration check against real Postgres: the wallet must not overdraw under
 * concurrency, a deposit must not be credited twice, a purchase must charge
 * exactly once, and a refund must return the money exactly once.
 * Run: npx tsx scripts/check-concurrency.ts
 */
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

import { Money } from '../src/core/entities/Money.js';
import { createPrismaClient } from '../src/infrastructure/database/prisma.js';
import { PrismaDepositRepository } from '../src/infrastructure/database/repositories/PrismaDepositRepository.js';
import { PrismaOrderRepository } from '../src/infrastructure/database/repositories/PrismaOrderRepository.js';
import { PrismaUserRepository } from '../src/infrastructure/database/repositories/PrismaUserRepository.js';

for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (match?.[1] && !process.env[match[1]]) {
    process.env[match[1]] = (match[2] ?? '').replace(/^["']|["']$/g, '');
  }
}

const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
const users = new PrismaUserRepository(prisma);
const deposits = new PrismaDepositRepository(prisma);
const orders = new PrismaOrderRepository(prisma);

const telegramId = BigInt(Date.now());
let failures = 0;

function check(label: string, passed: boolean, detail: string) {
  console.log(`${passed ? '✅' : '❌'} ${label} — ${detail}`);
  if (!passed) failures += 1;
}

const user = await users.create({ telegramId, username: 'concurrency-test', firstName: 'Test' });
await users.adjustBalance(user.id, Money.fromDecimal('500'));

// --- 1. Ten concurrent 400 ETB debits against a 500 ETB balance ---
const debits = await Promise.allSettled(
  Array.from({ length: 10 }, () => users.adjustBalance(user.id, Money.fromDecimal('-400'))),
);
const succeeded = debits.filter((r) => r.status === 'fulfilled').length;
const after = await users.findById(user.id);

check('exactly one concurrent debit succeeds', succeeded === 1, `${succeeded}/10 succeeded`);
check(
  'balance never goes negative',
  after !== null && !after.balance.isNegative(),
  `balance = ${after?.balance.format()}`,
);

// --- 2. Five concurrent approvals of one deposit ---
const deposit = await deposits.create({
  userId: user.id,
  amount: Money.fromDecimal('250'),
  screenshotUrl: 'test-file-id',
});

const approvals = await Promise.allSettled(
  Array.from({ length: 5 }, () => deposits.approveAndCredit(deposit.id, 999n)),
);
const approved = approvals.filter((r) => r.status === 'fulfilled').length;
const final = await users.findById(user.id);

check('exactly one approval succeeds', approved === 1, `${approved}/5 succeeded`);
check(
  'wallet credited exactly once',
  final?.balance.toDecimalString() === '350.00',
  `expected 350.00, got ${final?.balance.toDecimalString()}`,
);

// --- 3. Ten concurrent purchases against a balance that covers one ---
//
// The purchase transaction is the only place a customer is charged, so this
// is the invariant the whole money path rests on: the debit and the order row
// commit together, and the conditional balance check serialises the racers.
const product = await prisma.product.findFirst({ where: { isActive: true } });

if (!product) {
  console.log('⚠️  no active product; skipping the purchase checks');
} else {
  // Priced above half the balance, so only one attempt can possibly succeed —
  // otherwise the check would pass on a wallet that simply had room for more.
  const before = await users.findById(user.id);
  const price = Money.fromDecimal(before!.balance.toDecimalString()).subtract(
    Money.fromDecimal('10'),
  );

  const attempts = await Promise.allSettled(
    Array.from({ length: 10 }, () =>
      orders.createPaidOrderAndDebit({
        id: randomUUID(),
        userId: user.id,
        productId: product.id,
        productName: product.name,
        quantity: 1,
        pricePaid: price,
        listPrice: price,
        discountAmount: Money.ZERO,
        discountId: null,
        costETB: '0',
      }),
    ),
  );

  const bought = attempts.filter((result) => result.status === 'fulfilled').length;
  const rows = await prisma.order.count({ where: { userId: user.id } });
  const spent = await users.findById(user.id);

  check('exactly one concurrent purchase succeeds', bought === 1, `${bought}/10 succeeded`);
  // The point of the transaction: no order may exist that was not paid for,
  // and no payment may exist without its order.
  check('one order row per successful debit', rows === bought, `${rows} row(s) for ${bought} debit(s)`);
  check(
    'charged exactly once',
    spent?.balance.toDecimalString() ===
      Money.fromDecimal(before!.balance.toDecimalString()).subtract(price).toDecimalString(),
    `${before?.balance.format()} → ${spent?.balance.format()}`,
  );

  const paid = await prisma.order.findFirst({ where: { userId: user.id, status: 'PAID' } });

  if (paid) {
    // --- 4. Five concurrent refunds of that one order ---
    const refunds = await Promise.allSettled(
      Array.from({ length: 5 }, () => orders.refundPaidOrder(paid.id, 'concurrency check')),
    );
    const credited = refunds.filter(
      (result) => result.status === 'fulfilled' && result.value.refunded,
    ).length;
    const restored = await users.findById(user.id);

    check('exactly one refund credits the wallet', credited === 1, `${credited}/5 credited`);
    check(
      'refund returns the price exactly once',
      restored?.balance.toDecimalString() === before?.balance.toDecimalString(),
      `expected ${before?.balance.format()}, got ${restored?.balance.format()}`,
    );
  }
}

// Financial audit rows intentionally survive ordinary user deletion. This
// synthetic account is not business history, so remove its ledger facts too.
await prisma.moneyEvent.deleteMany({ where: { userId: user.id } });
await prisma.order.deleteMany({ where: { userId: user.id } });
await prisma.deposit.deleteMany({ where: { userId: user.id } });
await prisma.user.delete({ where: { id: user.id } });
console.log(failures === 0 ? '\nall invariants hold' : `\n${failures} INVARIANT(S) VIOLATED`);

await prisma.$disconnect();
process.exit(failures === 0 ? 0 : 1);
