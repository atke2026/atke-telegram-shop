/**
 * Writes the operator-authored product pages. Re-runnable; syncs never touch
 * these. Run: npx tsx scripts/seed-descriptions.ts
 *
 * Deliberately omits upstream "Price: $x / In stock: n" lines — the bot shows
 * its own ETB price and live stock, and a hardcoded copy would go stale.
 */
import fs from 'node:fs';

import { CACHE_KEYS } from '../src/core/constants.js';
import { RedisCache } from '../src/infrastructure/cache/RedisCache.js';
import { createPrismaClient } from '../src/infrastructure/database/prisma.js';
import { PrismaProductRepository } from '../src/infrastructure/database/repositories/PrismaProductRepository.js';
import { createLogger } from '../src/shared/logger.js';

for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (match?.[1] && !process.env[match[1]]) {
    process.env[match[1]] = (match[2] ?? '').replace(/^["']|["']$/g, '');
  }
}

const DESCRIPTIONS: Record<string, string> = {
  'coursera-plus-12m': `⚡ Org+ Premium Access
⚡ All Courses & Certificates
⚡ Certificate in Your Own Name
⚡ Ready-Made Account with Mail Access
⚡ Instant Delivery
⚡ Duration: 12 Months
⚡ 1 Month Warranty from Our Side

💡 Quick Guide

📌 Instructions
• Log in to Coursera using the provided login details.
• Change your name and password after your first login.
• Add a recovery email.
• Connect your Google or Facebook account (recommended).

ℹ️ Notes
• Organization Plus (Org+) account.
• Certificates will be issued in your own name.
• Full access to available courses.
• You can change the password anytime.
• The email address cannot be changed until the subscription expires.

✅ Happy Learning!`,

  'google-ai-pro-12m': `⚡ 18 Months Plan
⚡ 5TB cloud storage included
⚡ You can add 5 users
⚡ No sharing — 100% private
⚡ No card needed
⚡ Works in any country, no verification
⚡ Non-warranty

⚡ 100% genuine Gemini AI Pro subscription activated on your own Gmail.
⚡ FULL FAMILY ACCOUNT — it is not an invite.

📌 How to activate
Paste the received redeem link into your browser and click "Activate Offer". Your subscription will then be activated successfully.

⚠️ Important
The redeem link must be used within 24 hours of receiving the order. If you face any issue with the link, report it to us within 24 hours. After 24 hours, no replacement or reissue will be provided.`,

  'canva-single': `⚡ Instant activation done by our team
➡️ 1 Year Warranty
➡️ Instant payment verification`,

  'lovable-unlimited-extension-lifetime': `Lovable Freeze Credits — Unlimited Prompts

What's included:
• Unlimited prompts for Lovable projects
• Frozen credits and unlimited prompt support
• Lifetime license key
• Ready to use
• Instant delivery after purchase

📌 Extension download & setup guide:
https://hubx-lovable.hubxdigital.workers.dev/

Delivery is automatic after payment confirmation.`,

  'lovable-extension-admin-panel-lifetime': `Lovable Unlimited Prompts/Credits Extension — Admin Panel (Lifetime)

Key features:
• Custom branding support
• API access & integration
• Unlimited license creation
• License validity and expiration management
• Trial license generation with custom restrictions
• Custom license key prefix configuration
• Centralized license dashboard
• Full license tracking and control

What you can do:
• Create and manage unlimited licenses
• Set and modify expiration dates and validity periods
• Generate restricted or trial licenses
• Customize license key formats and prefixes
• Manage all branding settings from one dashboard
• Monitor, suspend, update or revoke licenses instantly
• Automate license operations through API integration
• Create license managers (reseller-style panels) for sub-distribution

ℹ️ Note
Lifetime means access remains valid until the service is discontinued or no longer operational.

Delivery is automatic after payment confirmation.`,

  'autodesk-panel': `➡️ Autodesk Edu 3000 Users Admin Panel
➡️ All Autodesk apps — 3 Years
➡️ Complete warranty
➡️ Delivered on your email
➡️ Instant delivery

Delivery is automatic after payment confirmation.`,

  'quillbot-premium': `⚡ Duration: 1 Month
⚡ Official coupon code
⚡ Full-time warranty
⚡ Valid for new accounts only
⚡ No card needed
⚡ Use the code within 7 days after delivery

Delivery is automatic after payment confirmation.`,

  'nord-vpn': `➡️ Product details
Premium NordVPN access for 3 months on up to 10 devices at once.

➡️ Activation steps
1. Open the link and click "Claim"
2. Enter your email address
3. Enter the verification code received on your email
4. On the payment page, scroll to the bottom and click "Skip"

➡️ Done! Just log in with your email on any device.

Delivery is automatic after payment confirmation.`,

  'notion-business-12m': `➡️ Instant coupon delivery
➡️ Coupon redeem warranty only

Delivery is automatic after payment confirmation.`,
};

const logger = createLogger('warn', false);
const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
const cache = RedisCache.connect(process.env.REDIS_URL ?? '', logger);
const products = new PrismaProductRepository(prisma);

let written = 0;
for (const [slug, details] of Object.entries(DESCRIPTIONS)) {
  const product = await products.findBySlugOrId(slug);
  if (!product) {
    console.error(`❌ no product with slug "${slug}"`);
    continue;
  }

  await products.setDescription(product.id, details);
  written += 1;
  console.log(`✅ ${product.name}  (${details.split('\n').length} lines)`);
}

// Any product left without a page would show a bare title.
const missing = (await products.listActive()).filter((p) => !p.descriptionOverride);
if (missing.length > 0) {
  console.log(`\n⚠️  ${missing.length} product(s) still have no details:`);
  for (const product of missing) console.log(`   ${product.slug} — ${product.name}`);
}

await cache.del(CACHE_KEYS.products);
console.log(`\n${written} description(s) written, catalogue cache cleared.`);

await prisma.$disconnect();
await cache.disconnect();
