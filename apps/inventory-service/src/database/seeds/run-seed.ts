import dataSource from '../data-source';
import { InventoryItem } from 'src/modules/inventory/entities/inventory-item.entity';

async function runSeed() {
  await dataSource.initialize();
  console.log('Seeding inventory...');

  const itemRepo = dataSource.getRepository(InventoryItem);

  // Query products from the product schema in the same DB
  const products: { id: string }[] = await dataSource.query(
    `SELECT id FROM product.products`,
  );

  if (products.length === 0) {
    console.log(
      'No products found in product schema. Run product-service seed first.',
    );
    await dataSource.destroy();
    return;
  }

  let created = 0;
  for (const product of products) {
    const exists = await itemRepo.findOne({ where: { productId: product.id } });
    if (!exists) {
      await itemRepo.save(
        itemRepo.create({
          productId: product.id,
          totalStock: 100,
          reserved: 0,
          available: 100,
        }),
      );
      created++;
    }
  }

  console.log(
    `Inventory seeded: ${created} items created for ${products.length} products.`,
  );
  await dataSource.destroy();
}

runSeed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
