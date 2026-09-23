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

// In development .env sits beside package.json; on the server it lives one
// level up, outside the directory a deploy replaces. Either is fine, and so is
// neither when the variables are already exported.
for (const candidate of ['.env', '../.env']) {
  if (!fs.existsSync(candidate)) continue;

  for (const line of fs.readFileSync(candidate, 'utf8').split('\n')) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (match?.[1] && !process.env[match[1]]) {
      process.env[match[1]] = (match[2] ?? '').replace(/^["']|["']$/g, '');
    }
  }
  break;
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
  'canva-admin-panel': `✨ What you get
• Canva Pro Education verified admin panel
• All Canva Pro premium features
• Supplied account, delivered ready to use

🗓 Duration: 3 years
👤 Account: supplied by us, with mail access
🛡 Warranty: 2 months, full

📌 What arrives
CANVA & Outlook email:password | 2FA email:password | 2FA website

Delivery is automatic after payment confirmation.`,

  'coursera-premium-12m': `✨ What you get
• Organization Plus (Org+) premium access
• Every course and certificate
• Certificates issued in your own name
• Supplied account with mail access

🗓 Duration: 12 months
👤 Account: supplied by us, with mail access
🛡 Warranty: 1 month

📌 How to activate
1. Log in to Coursera with the details you receive.
2. Change your name and password after the first login.
3. Add a recovery email.
4. Connect your Google or Facebook account (recommended).

⚠️ Important
• You can change the password at any time.
• The email address cannot be changed until the subscription expires.

✅ Happy learning!

Delivery is automatic after payment confirmation.`,

  'elevenlabs-creator-12m': `✨ What you get
• ElevenLabs Creator plan, applied to your own account
• Official coupon code

🗓 Duration: 12 months
👤 Account: your own
🛡 Warranty: none once the coupon has been activated

⚠️ Important
Redeem the code within 7 days of purchase. After that it may expire, and an
expired code cannot be replaced.

📌 How to activate
1. Create a free account at elevenlabs.io
2. Complete the onboarding steps.
3. Upgrade to the "Creator" plan with Monthly billing.
4. At checkout, click "Add promotion code" and enter your code.
5. Check the discount has applied before completing checkout.

Delivery is automatic after payment confirmation.`,

  'factory-pro-1-year': `✨ What you get
• Factory Pro, applied to your own account
• Official coupon code

🗓 Duration: 12 months
👤 Account: your own
🛡 Warranty: none once the code has been activated

📌 How to activate
1. Create an account at app.factory.ai
2. Complete all onboarding steps.
3. Go to app.factory.ai/voucher
   (You may need to paste this address in yourself — it is not always in the menu.)
4. Enter your code in the "Voucher Code" field.
5. Click "Redeem Voucher".

Delivery is automatic after payment confirmation.`,

  'gamma-pro-1-year': `✨ What you get
• Gamma Pro yearly plan, applied to your own account
• Official coupon code

🗓 Duration: 12 months
👤 Account: your own
🛡 Warranty: none once the coupon has been activated

⚠️ Important
Redeem the code within 7 days of purchase. After that it may expire, and an
expired code cannot be replaced.

📌 How to activate
1. Log in to your Gamma account.
2. Select the Gamma Pro Yearly plan.
3. Enter the coupon code.
4. Complete checkout with your card or any virtual card.

Delivery is automatic after payment confirmation.`,

  'linkedin-business-2m-new-user': `✨ What you get
• LinkedIn Business premium, activated on your own account
• Redeem link

🗓 Duration: 2 months
👤 Account: your own

⚠️ Before you buy
• Works only on accounts that have not used any LinkedIn premium subscription
  in the last 12 months.
• The link must be activated within 24 hours of receiving it.

📌 How to activate
1. Log in to LinkedIn in your browser.
2. Open the redeem link in a new tab.
3. Click Activate.
4. A valid card may be requested for verification at checkout.
5. Premium access starts immediately.

Delivery is automatic after payment confirmation.`,

  'linkedin-career-2m-new-user': `✨ What you get
• LinkedIn Career premium, activated on your own account
• Redeem link

🗓 Duration: 2 months
👤 Account: your own

⚠️ Before you buy
• Works only on accounts that have not used any LinkedIn premium subscription
  in the last 12 months.
• The link must be activated within 24 hours of receiving it.
• Not available in every region — the offer may not appear on some accounts.

📌 How to activate
1. Log in to LinkedIn in your browser.
2. Open the redeem link in a new tab.
3. Click Activate.
4. A valid card may be requested for verification at checkout.
5. Premium access starts immediately.

Delivery is automatic after payment confirmation.`,

  'lovable-lite-12m': `✨ What you get
• Full Lovable Lite access
• 5 daily credits, up to 150 per month
• A one-time 300 credits (not monthly)
• Custom domains
• The Lovable badge removed

🗓 Duration: 12 months
👤 Account: your own, activated with a redeem link
🛡 Warranty: 1 month

⚠️ Important
Use the redeem link within 72 hours of receiving your order, or it may expire.

Delivery is automatic after payment confirmation.`,

  'microsoft-365-family': `✨ What you get
• Microsoft 365 Family, direct yearly billed plan
• Supplied account with mail access
• You can change the password

🗓 Duration: 12 months
👤 Account: supplied by us, with mail access
🛡 Warranty: none

Delivery is automatic after payment confirmation.`,

  'n8n-starter-12m': `✨ What you get
• n8n Starter plan, applied to your own account
• Official coupon code

🗓 Duration: 12 months
👤 Account: your own
🛡 Warranty: none once the coupon has been activated

⚠️ Important
Redeem the code within 7 days of purchase. After that it may expire, and an
expired code cannot be replaced.

Delivery is automatic after payment confirmation.`,

  'notion-business-3m': `✨ What you get
• Full Notion AI — agent, meeting notes and search
• Private teamspaces, SAML SSO, granular permissions

🗓 Duration: 3 months
👤 Account: your own, activated with a coupon
🛡 Warranty: covers redeeming the coupon only

Delivery is automatic after payment confirmation.`,

  'railway-hobby-12m': `✨ What you get
• Railway Hobby plan, applied to your own account
• $20 in monthly credits for 12 months — this covers the $5/month Hobby plan
  and leaves roughly $15 a month for usage
• Official coupon code

🗓 Duration: 12 months
👤 Account: your own
🛡 Warranty: none once the coupon has been activated

⚠️ Before you buy
• Valid on new Railway accounts only.
• Redeem the code within 7 days of purchase, or it may expire.

📌 How to activate
1. Open the link provided and create a new Railway account.
2. Go to Profile (top right) → Workspace Settings → Plans.
3. If your account qualifies, the promotion name appears in the middle of the page.
4. Upgrade to the "Hobby" plan.
5. Enter your billing details to activate the subscription.

Delivery is automatic after payment confirmation.`,

  'warp-build-12m': `✨ What you get
• Warp Build plan, applied to your own account
• A $20 discount on each of 12 monthly payments
• Official coupon code

🗓 Duration: 12 months
👤 Account: your own
🛡 Warranty: none once the coupon has been activated

⚠️ Important
• Redeem the code within 7 days of purchase, or it may expire.
• The code only works with Monthly billing.
• Check your card and billing details before confirming. If they are wrong the
  code can still be marked as used, and it cannot be redeemed again.

📌 How to activate
1. Download Warp from warp.dev
2. Install and open the app.
3. Click "Sign Up" and create a free account with your email.
4. Upgrade at app.warp.dev/upgrade, or in the app under
   Settings → Billing & Usage → Upgrade.
5. Select the "Build" plan.
6. Change the billing option from Annual to Monthly.
7. At checkout, click "Add promotion code" and enter your code.

ℹ️ Notes
• The discount applies to 1 seat. Extra team members are charged normally.
• An existing team can receive at most $240 in total ($20 × 12 months).

Delivery is automatic after payment confirmation.`,

  'replit-core-12m': `✨ What you get
• Replit Core, applied to your own account
• Official coupon code

🗓 Duration: 12 months
👤 Account: your own
🛡 Warranty: none once the coupon has been activated

⚠️ Important
Redeem the code within 7 days of purchase. After that it may expire, and an
expired code cannot be replaced.

📌 How to activate
1. Create your account on Replit.
2. Start the upgrade either from the onboarding flow, or with the
   "Upgrade to Replit Core" button at the bottom left of the Home page.
3. Select the "Replit Core" plan with Annual billing.
4. At checkout, click "Add promotion code" and enter your code.

Delivery is automatic after payment confirmation.`,

  'wispr-flow-pro-1-year': `✨ What you get
• Wispr Flow Pro, applied to your own account
• Official coupon code

🗓 Duration: 12 months
👤 Account: your own
🛡 Warranty: none once the coupon has been activated

⚠️ Important
Redeem the code within 7 days of purchase. After that it may expire, and an
expired code cannot be replaced.

📌 How to activate
1. Download the Wispr Flow desktop app (Mac or Windows) from
   wisprflow.ai/downloads
2. Sign up for a free account and finish the setup on your device.
3. Upgrade to Pro with Annual billing:
   Settings → Plans & Billing → Upgrade to Pro
4. At checkout, click "Add promotion code" and enter your code.

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
