export type Member = { id: string; name: string; role: "admin" | "member" };

export type BetStatus = "proposed" | "open" | "pending_result" | "settled" | "push" | "void" | "declined";

export type Bet = {
  id: string;
  crew_id: string;
  proposer: string;
  opponent: string;
  wager: string;
  stakes: number;
  status: BetStatus;
  claimed_outcome: "win" | "push" | "void" | null;
  claimed_winner: string | null;
  claimed_by: string | null;
  winner: string | null;
  settlement_note: string;
  created_at: string;
  accepted_at: string | null;
  settled_at: string | null;
};

export type AnytimerStatus = "outstanding" | "called" | "redeemed";

export type Anytimer = {
  id: string;
  crew_id: string;
  bet_id: string;
  holder: string;
  owes: string;
  status: AnytimerStatus;
  created_at: string;
  called_at: string | null;
  redeemed_at: string | null;
};

export type Crew = {
  id: string;
  name: string;
  invite_code: string;
  rules: string;
  created_by: string;
};

export type DrinkPhoto = {
  id: string;
  crew_id: string;
  anytimer_id: string;
  uploaded_by: string;
  path: string;
  created_at: string;
  url: string | null;
};

export type ActionState = { error?: string; ok?: string } | null;
