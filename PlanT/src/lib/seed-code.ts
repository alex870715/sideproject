import { prisma } from "@/lib/prisma";

const SEED_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateSeedCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += SEED_CHARS[Math.floor(Math.random() * SEED_CHARS.length)];
  }
  return code;
}

export async function generateUniqueSeedCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const seedCode = generateSeedCode();
    const existing = await prisma.trip.findUnique({
      where: { seedCode },
      select: { id: true },
    });
    if (!existing) return seedCode;
  }
  throw new Error("Failed to generate unique seed code");
}
