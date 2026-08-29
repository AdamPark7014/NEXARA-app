export interface HikvisionApiConfig {
  baseUrl: string;
  port: number;
  /** Legacy field; Artemis usa appKey, no usuario portal. */
  username: string;
  password: string;
  timeout?: number;
  configured?: boolean;
}

export interface HikvisionDoor {
  doorIndexCode: string;
  doorNo: number;
  doorName: string;
  doorType: string;
  readerCount: number;
  location?: string;
  status?: {
    online: boolean;
    locked: boolean;
  };
}

export interface HikvisionDoorEvent {
  eventID: string;
  doorIndexCode: string;
  doorNo: number;
  readerNo: number;
  cardNo: string;
  personID: string;
  eventTime: string;
  eventType: string;
  status: string;
  temperature?: number;
}
