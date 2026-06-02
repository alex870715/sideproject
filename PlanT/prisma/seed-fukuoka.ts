import { PrismaClient } from "@prisma/client";
import { generateUniqueSeedCode } from "../src/lib/seed-code";

const prisma = new PrismaClient();

const TRUNK_SPOTS = [
  {
    name: "福岡機場 (FUK)",
    latitude: 33.5859,
    longitude: 130.451,
    openHours: "24hr",
    notes: "Day 1 · 抵達，搭地鐵前往博多",
  },
  {
    name: "Canal City 博多",
    latitude: 33.5894,
    longitude: 130.4117,
    openHours: "10:00–21:00",
    notes: "Day 1 · 購物、噴水秀",
  },
  {
    name: "中洲屋台街",
    latitude: 33.5931,
    longitude: 130.4066,
    openHours: "18:00–02:00",
    notes: "Day 1 · 拉麵、烤雞串、明太子",
  },
  {
    name: "櫛田神社",
    latitude: 33.5916,
    longitude: 130.4103,
    openHours: "04:00–22:00",
    notes: "Day 2 · 博多總鎮守，求平安",
  },
  {
    name: "太宰府天滿宮",
    latitude: 33.5198,
    longitude: 130.5343,
    openHours: "06:00–19:00",
    notes: "Day 2 · 半日郊遊，梅枝餅必吃",
  },
  {
    name: "大濠公園",
    latitude: 33.5862,
    longitude: 130.3798,
    openHours: "24hr",
    notes: "Day 3 · 晨跑或划船",
  },
  {
    name: "福岡塔 & 百道海濱",
    latitude: 33.5931,
    longitude: 130.3515,
    openHours: "09:30–22:00",
    notes: "Day 3 · 海景夕陽",
  },
  {
    name: "天神地下街",
    latitude: 33.5902,
    longitude: 130.3987,
    openHours: "10:00–20:00",
    notes: "Day 4 · 最後採買、藥妝",
  },
  {
    name: "博多站 & 一蘭拉麵本店",
    latitude: 33.5902,
    longitude: 130.4206,
    openHours: "24hr",
    notes: "Day 5 · 返程前告別拉麵",
  },
];

const SPROUT_SPOTS = [
  {
    memberName: "阿哲",
    name: "糸島 櫻井神社 & 海邊咖啡",
    latitude: 33.5612,
    longitude: 130.1982,
    openHours: "09:00–17:00",
    notes: "Day 3 · 個人支線：海景網美點",
  },
  {
    memberName: "小柚",
    name: "由布院 金鱗湖",
    latitude: 33.2631,
    longitude: 131.3542,
    openHours: "24hr",
    notes: "Day 4 · 一日溫泉小旅行",
  },
  {
    memberName: "Sam",
    name: "博多町家ふるさと館（明太子DIY）",
    latitude: 33.5831,
    longitude: 130.4098,
    openHours: "10:00–17:00",
    notes: "Day 2 · 手作體驗支線",
  },
];

async function main() {
  const startDate = new Date("2026-06-01T09:00:00+09:00");
  const endDate = new Date("2026-06-05T18:00:00+09:00");
  const seedCode = await generateUniqueSeedCode();

  const trip = await prisma.trip.create({
    data: {
      seedCode,
      title: "5天4夜福岡之旅 🌸",
      startDate,
      endDate,
      members: {
        create: [
          { name: "阿哲", email: "alex@example.com" },
          { name: "小柚", email: "yuki@example.com" },
          { name: "Sam", email: "sam@example.com" },
        ],
      },
    },
    include: { members: true },
  });

  const trunkScheduleHours = [10, 14, 19, 9, 11, 8, 16, 11, 12];

  for (let i = 0; i < TRUNK_SPOTS.length; i++) {
    const spot = TRUNK_SPOTS[i];
    const dayOffset = i < 3 ? 0 : i < 5 ? 1 : i < 7 ? 2 : i < 8 ? 3 : 4;
    const scheduledAt = new Date(startDate);
    scheduledAt.setDate(scheduledAt.getDate() + dayOffset);
    scheduledAt.setHours(trunkScheduleHours[i], 0, 0, 0);

    await prisma.spot.create({
      data: {
        tripId: trip.id,
        name: spot.name,
        latitude: spot.latitude,
        longitude: spot.longitude,
        openHours: spot.openHours,
        notes: spot.notes,
        scheduledAt,
        isTrunk: true,
        sortOrder: i,
      },
    });
  }

  for (let i = 0; i < SPROUT_SPOTS.length; i++) {
    const spot = SPROUT_SPOTS[i];
    const member = trip.members.find((m) => m.name === spot.memberName);
    await prisma.spot.create({
      data: {
        tripId: trip.id,
        memberId: member?.id,
        name: spot.name,
        latitude: spot.latitude,
        longitude: spot.longitude,
        openHours: spot.openHours,
        notes: spot.notes,
        isTrunk: false,
        sortOrder: i,
      },
    });
  }

  console.log("\n🌱 PlanT 測試行程已建立！");
  console.log("─────────────────────────────");
  console.log(`標題：${trip.title}`);
  console.log(`Seed Code：${trip.seedCode}`);
  console.log(
    `日期：${startDate.toLocaleDateString("zh-TW")} – ${endDate.toLocaleDateString("zh-TW")}`
  );
  console.log(`Trunk 景點：${TRUNK_SPOTS.length} 個`);
  console.log(`Sprout 支線：${SPROUT_SPOTS.length} 個`);
  console.log(`\n👉 開啟：http://localhost:3000/trip/${trip.seedCode}`);
  console.log("─────────────────────────────\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
