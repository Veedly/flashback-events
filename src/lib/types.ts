export type EventRecord = {
  id: string;
  title: string;
  date: string;
  location: string;
  createdAt: string;
  photoCount: number;
  guestPhotoLimit: 20 | 50 | 100 | null;
};

export type PhotoRecord = {
  id: string;
  url: string;
  createdAt: string;
  authorName: string | null;
};

export type LeaderboardEntry = {
  guestId: string;
  displayName: string;
  photoCount: number;
};

export type GuestSession = {
  guestId: string;
  guestToken: string;
  displayName: string;
  photoCount: number;
  photoLimit: 20 | 50 | 100 | null;
};

export type EventDetails = EventRecord & {
  photos: PhotoRecord[];
  leaderboard: LeaderboardEntry[];
};

export type UploadTicket = {
  photoId: string;
  path: string;
  uploadToken: string;
  completionToken: string;
};
