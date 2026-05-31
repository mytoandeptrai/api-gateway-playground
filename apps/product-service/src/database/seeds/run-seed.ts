import dataSource from '../data-source';
import { Product } from 'src/modules/product/product.entity';

const products: Partial<Product>[] = [
  {
    name: 'iPhone 15 Pro',
    description: 'Chip A17 Pro, camera 48MP, titanium design',
    price: 29990000,
    stock: 50,
  },
  {
    name: 'Samsung Galaxy S24 Ultra',
    description: 'Snapdragon 8 Gen 3, S Pen, camera 200MP',
    price: 31990000,
    stock: 40,
  },
  {
    name: 'MacBook Air M3',
    description: 'Apple M3 chip, 15.3 inch, 18h battery',
    price: 32990000,
    stock: 30,
  },
  {
    name: 'iPad Pro M4',
    description: 'Apple M4 chip, OLED display, 11 inch',
    price: 27990000,
    stock: 25,
  },
  {
    name: 'Sony WH-1000XM5',
    description: 'Industry-leading noise cancelling, 30h battery',
    price: 8490000,
    stock: 80,
  },
  {
    name: 'Apple Watch Series 9',
    description: 'S9 chip, double tap gesture, Always-On display',
    price: 11990000,
    stock: 60,
  },
  {
    name: 'Dell XPS 15',
    description: 'Intel Core i9, RTX 4060, 15.6 inch OLED',
    price: 38990000,
    stock: 15,
  },
  {
    name: 'LG OLED C3 65"',
    description: '4K OLED evo, 120Hz, Dolby Vision',
    price: 45990000,
    stock: 10,
  },
  {
    name: 'PlayStation 5 Slim',
    description: 'Next-gen gaming console, 1TB SSD',
    price: 13990000,
    stock: 35,
  },
  {
    name: 'Nintendo Switch OLED',
    description: '7 inch OLED screen, enhanced audio, 64GB',
    price: 7490000,
    stock: 45,
  },
  {
    name: 'Kindle Paperwhite',
    description: '6.8 inch, 300 ppi, waterproof, 3 months battery',
    price: 3990000,
    stock: 100,
  },
  {
    name: 'AirPods Pro (2nd Gen)',
    description: 'Active Noise Cancellation, Adaptive Audio, USB-C',
    price: 6490000,
    stock: 70,
  },
  {
    name: 'GoPro HERO12 Black',
    description: '5.3K video, HyperSmooth 6.0, waterproof 10m',
    price: 11490000,
    stock: 40,
  },
  {
    name: 'Xiaomi 14 Ultra',
    description: 'Leica camera, Snapdragon 8 Gen 3, 90W charging',
    price: 18990000,
    stock: 55,
  },
  {
    name: 'Garmin Fenix 7X Pro',
    description: 'Solar charging, multi-sport GPS, 37 days battery',
    price: 21990000,
    stock: 20,
  },
];

async function runSeed() {
  await dataSource.initialize();
  // Ensure schema and tables exist before seeding
  const schema = process.env.DB_SCHEMA || 'public';
  await dataSource.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  await dataSource.synchronize();

  console.log('Data source initialized. Running product seeds...');

  const productRepo = dataSource.getRepository(Product);

  let created = 0;
  let skipped = 0;

  for (const product of products) {
    const exists = await productRepo.findOne({ where: { name: product.name } });
    if (!exists) {
      await productRepo.save(productRepo.create(product));
      console.log(`  ✓ Created: ${product.name}`);
      created++;
    } else {
      skipped++;
    }
  }

  console.log(
    `\nProduct seeding complete. Created: ${created}, Skipped: ${skipped}`,
  );
  await dataSource.destroy();
}

runSeed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
