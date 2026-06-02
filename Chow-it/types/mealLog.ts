/** Single meal log row persisted locally (later syncable to Supabase). */
export type MealLogEntry = {
  id: string;
  /** Calendar date in local time `YYYY-MM-DD` */
  date: string;
  /** User memo — dishes, mood, price, companions, etc. */
  note: string;
  /** Copied under FileSystem.documentDirectory when possible */
  photoUri: string | null;
  createdAt: string;
};
