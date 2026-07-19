export type EventRecord = {
  id: string;
  title: string;
  date: string;
  location: string;
  createdAt: string;
  photoCount: number;
};

export type PhotoRecord = {
  id: string;
  url: string;
  createdAt: string;
};

export type EventDetails = EventRecord & {
  photos: PhotoRecord[];
};

export type UploadTicket = {
  photoId: string;
  path: string;
  uploadToken: string;
  completionToken: string;
};
