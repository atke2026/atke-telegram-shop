/**
 * Integration check against real Postgres: the wallet must not overdraw under
 * concurrency, and a deposit must not be credited twice.
 * Run: npx tsx scripts/check-concurrency.ts
 */
import fs from 'node:fs';

import { Money } from '../src/core/entities/Money.js';
import { createPrismaClient } from '../src/infrastructure/database/prisma.js';
import { PrismaDepositRepository } from '../src/infrastructure/database/repositories/PrismaDepositRepository.js';
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

await prisma.deposit.deleteMany({ where: { userId: user.id } });
await prisma.user.delete({ where: { id: user.id } });
console.log(failures === 0 ? '\nall invariants hold' : `\n${failures} INVARIANT(S) VIOLATED`);

await prisma.$disconnect();
process.exit(failures === 0 ? 0 : 1);
