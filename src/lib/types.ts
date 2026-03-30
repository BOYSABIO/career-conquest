export interface Application {
  company: string;
  position: string;
  date: string;
  status: "applied" | "reject" | "interview" | "offer";
  link: string;
  category: "company" | "startup";
}

export interface Territory {
  id: string;
  company: string;
  applications: Application[];
  x: number;
  y: number;
  status: "active" | "fallen" | "sieging" | "conquered";
}

export interface GuestMessage {
  id: string;
  text: string;
  type: "encouragement" | "roast";
  author: string;
  created_at: string;
}

export interface MapDimensions {
  width: number;
  height: number;
  castleX: number;
  castleY: number;
}
