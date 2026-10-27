import db from './db';

// ─── Exported function — safe to call from the server on startup ──────────────
export function seedIfEmpty(): void {
  const { count } = db
    .prepare('SELECT COUNT(*) as count FROM trips')
    .get() as { count: number };

  if (count > 0) {
    console.log('⏭  Seed skipped — database already has data.');
    return;
  }

  const insertTrip = db.prepare(`
    INSERT INTO trips (title, description, start_date, end_date, tags)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertLocation = db.prepare(`
    INSERT INTO locations (trip_id, name, country, lat, lng, date_start, date_end, description, notes, order_index, rating)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    // Trip 1 — Japan
    const t1 = insertTrip.run(
      'Cherry Blossoms in Japan',
      'An unforgettable journey through Japan during cherry blossom season — from the neon streets of Tokyo to the serene temples of Kyoto and the deer park of Nara.',
      '2024-03-25', '2024-04-08',
      JSON.stringify(['culture', 'food', 'nature', 'city'])
    );
    insertLocation.run(t1.lastInsertRowid, 'Tokyo', 'Japan', 35.6762, 139.6503,
      '2024-03-25', '2024-03-30',
      'Explored Shibuya crossing, Senso-ji temple in Asakusa, and the electric neighbourhood of Akihabara. Tried incredible ramen and conveyor-belt sushi.',
      'The teamLab Borderless digital art museum was mind-blowing. Book tickets in advance!', 0, 5);
    insertLocation.run(t1.lastInsertRowid, 'Nikko', 'Japan', 36.7198, 139.6983,
      '2024-03-31', '2024-04-01',
      'Day trip to the ornate Toshogu Shrine, a UNESCO World Heritage site nestled in the mountains.',
      'Take the Tobu Nikko line from Asakusa — much cheaper than Shinkansen.', 1, 4);
    insertLocation.run(t1.lastInsertRowid, 'Kyoto', 'Japan', 35.0116, 135.7681,
      '2024-04-01', '2024-04-05',
      'Wandered through thousands of torii gates at Fushimi Inari, witnessed a geisha in Gion at dusk, and found inner peace at the Arashiyama bamboo grove.',
      "Rent a bicycle to explore the city — it's the best way to discover hidden shrines.", 2, 5);
    insertLocation.run(t1.lastInsertRowid, 'Nara', 'Japan', 34.6851, 135.8048,
      '2024-04-05', '2024-04-06',
      "Fed the famous free-roaming deer at Nara Park and visited the colossal Todai-ji temple housing Japan's largest bronze Buddha.",
      'The deer bow back if you bow first! Bring deer crackers (shika senbei) from vendors.', 3, 4);
    insertLocation.run(t1.lastInsertRowid, 'Osaka', 'Japan', 34.6937, 135.5023,
      '2024-04-06', '2024-04-08',
      "Indulged in Osaka's legendary street food scene — takoyaki, okonomiyaki, and endless skewers at Dotonbori. Visited the impressive Osaka Castle.",
      'Osaka is the food capital of Japan. Do the Dotonbori street food crawl at night.', 4, 5);

    // Trip 2 — Iceland
    const t2 = insertTrip.run(
      'Iceland Ring Road Adventure',
      "A self-drive journey around Iceland's legendary Route 1 — chasing northern lights, exploring volcanic landscapes, and marvelling at waterfalls that seem to pour from the sky.",
      '2023-09-10', '2023-09-20',
      JSON.stringify(['adventure', 'nature', 'hiking'])
    );
    insertLocation.run(t2.lastInsertRowid, 'Reykjavik', 'Iceland', 64.1355, -21.8954,
      '2023-09-10', '2023-09-11',
      "Arrived in the world's northernmost capital. Explored the colourful old town, climbed Hallgrímskirkja church for panoramic views, and tasted the famous Icelandic hot dog.",
      'The Reykjavik Art Museum is excellent and affordable. Download the Safetravel Iceland app before driving.', 0, 4);
    insertLocation.run(t2.lastInsertRowid, 'Golden Circle', 'Iceland', 64.3271, -20.1199,
      '2023-09-11', '2023-09-12',
      "Ticked off Iceland's classic Golden Circle: Þingvellir National Park, Geysir geothermal area, and the thundering Gullfoss waterfall.",
      'Arrive at Geysir early — the Strokkur geyser erupts every 5–10 minutes and crowds build quickly.', 1, 5);
    insertLocation.run(t2.lastInsertRowid, 'Vik', 'Iceland', 63.4186, -19.0060,
      '2023-09-13', '2023-09-14',
      'Stood on the black sand beach at Reynisfjara with its basalt columns and crashing waves. Visited Skógafoss and Seljalandsfoss waterfalls on the way.',
      'NEVER turn your back to the waves at Reynisfjara — sneaker waves are deadly here.', 2, 5);
    insertLocation.run(t2.lastInsertRowid, 'Jökulsárlón Glacier Lagoon', 'Iceland', 64.0784, -16.2306,
      '2023-09-15', '2023-09-16',
      "Took a zodiac boat tour among icebergs calving from Europe's largest glacier. Diamond Beach glitters with ice chunks on black sand.",
      'Book the amphibious boat tour in advance. Best light for photos is golden hour — around 7–8pm in September.', 3, 5);
    insertLocation.run(t2.lastInsertRowid, 'Akureyri', 'Iceland', 65.6885, -18.1262,
      '2023-09-17', '2023-09-18',
      "Iceland's charming second city. Used it as a base for whale watching in Eyjafjörður fjord and a visit to Goðafoss waterfall.",
      'The botanical garden is free and surprisingly lush. Whale watching has ~95% success rate here.', 4, 4);

    // Trip 3 — Morocco
    const t3 = insertTrip.run(
      'Moroccan Medinas & Desert',
      "A sensory journey through Morocco's imperial cities, ending under a billion stars in the Sahara Desert dunes of Merzouga.",
      '2024-11-01', '2024-11-10',
      JSON.stringify(['culture', 'adventure', 'food'])
    );
    insertLocation.run(t3.lastInsertRowid, 'Marrakech', 'Morocco', 31.6295, -7.9811,
      '2024-11-01', '2024-11-03',
      "Lost myself in the labyrinthine souks of the medina, watched the chaos of Djemaa el-Fna square transform at dusk, and explored the serene Majorelle Garden.",
      'Hire a local guide for the first medina walk — you will get hopelessly lost otherwise. Worth every dirham.', 0, 5);
    insertLocation.run(t3.lastInsertRowid, 'Fès', 'Morocco', 34.0181, -5.0078,
      '2024-11-04', '2024-11-06',
      "Explored the world's oldest university city and the medieval tanneries of Fès el-Bali. The smell hits you before you see the coloured vats!",
      'The Chouara Tannery is best viewed from the leather shop balconies above. Visit in the morning for best colours.', 1, 4);
    insertLocation.run(t3.lastInsertRowid, 'Merzouga Sahara', 'Morocco', 31.0980, -3.9739,
      '2024-11-07', '2024-11-09',
      'Rode camels into the Erg Chebbi dunes at sunset and spent the night in a Berber camp beneath the clearest night sky imaginable. Woke before dawn to watch the sunrise paint the dunes gold.',
      'Pack layers — the desert is scorching during the day but freezing at night. A headtorch is essential.', 2, 5);
  })();

  console.log('✅ Database seeded: 3 sample trips loaded.');
}

// ─── Also runnable as a standalone script ────────────────────────────────────
// ts-node src/database/seed.ts
if (require.main === module) {
  const { initializeSchema } = require('./schema');
  initializeSchema();
  seedIfEmpty();
}
