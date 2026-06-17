/**
 * Seed script — populates Postgres with mock sellers, emails, products, and
 * suggestions so the dashboard has realistic data on first run.
 *
 * Usage: from apps/api -> `npm run seed`
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('[seed] starting...');

  const seller = await prisma.seller.upsert({
    where: { email: 'liyana2015za@gmail.com' },
    create: {
      email: 'liyana2015za@gmail.com',
      name: 'Liyana Fashion House',
      brandName: 'Liyana',
      qualityScore: 0.87,
      totalProducts: 42,
      totalEmails: 7,
    },
    update: {},
  });

  const email = await prisma.email.create({
    data: {
      gmailMessageId: `seed_${Date.now()}`,
      sellerId: seller.id,
      fromAddress: seller.email,
      subject: 'New Inventory — Summer Kurta Collection',
      receivedAt: new Date(),
      status: 'PARSED',
      confidenceScore: 87,
      missingFields: ['hsn_code', 'fabric_composition', 'wash_care', 'neckline'],
    },
  });

  const product = await prisma.product.create({
    data: {
      emailId: email.id,
      sellerId: seller.id,
      sku: 'LFH-KRT-001',
      title: 'Floral Print Cotton Kurta',
      brand: 'Liyana',
      category: 'Women > Ethnicwear > Kurtas',
      mrp: 1499,
      status: 'ENRICHING',
      confidenceScore: 87,
    },
  });

  await prisma.aISuggestion.createMany({
    data: [
      {
        productId: product.id,
        fieldKey: 'hsn_code',
        suggestedValue: '61091000',
        reasoning: 'Cotton kurtas / t-shirts HSN per CBIC',
        source: 'CROSS_REF',
        confidence: 0.91,
      },
      {
        productId: product.id,
        fieldKey: 'fabric_family',
        suggestedValue: 'Cotton',
        reasoning: 'Visible weave + product title',
        source: 'GEMINI_VISION',
        confidence: 0.93,
      },
    ],
  });

  console.log('[seed] done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
