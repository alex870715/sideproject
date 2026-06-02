import { NextResponse } from "next/server";

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export function normalizeSeedCode(seedCode: string): string {
  return seedCode.trim().toUpperCase();
}

export function isValidSeedCode(seedCode: string): boolean {
  return /^[A-Z0-9]{6}$/.test(seedCode);
}
