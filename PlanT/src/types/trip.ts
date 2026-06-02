export type SpotDto = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  openHours: string | null;
  phone: string | null;
  notes: string | null;
  scheduledAt: string | null;
  isTrunk: boolean;
  sortOrder: number;
  memberId: string | null;
  member?: { id: string; name: string } | null;
};

export type MemberDto = {
  id: string;
  name: string;
  email: string | null;
};

export type TripDto = {
  id: string;
  seedCode: string;
  title: string;
  startDate: string;
  endDate: string;
  spots: SpotDto[];
  members: MemberDto[];
};

export type CreateTripBody = {
  title: string;
  startDate: string;
  endDate: string;
  memberName?: string;
};

export type CreateSpotBody = {
  name: string;
  latitude: number;
  longitude: number;
  openHours?: string;
  phone?: string;
  notes?: string;
  scheduledAt?: string;
  isTrunk?: boolean;
  memberId?: string;
  memberName?: string;
};

export type UpdateSpotBody = {
  name?: string;
  openHours?: string | null;
  phone?: string | null;
  notes?: string | null;
  scheduledAt?: string | null;
  sortOrder?: number;
};

export type CreateMemberBody = {
  name: string;
  email?: string;
};

export type UpdateMemberBody = {
  name?: string;
  email?: string | null;
};
