export interface HikvisionApiConfig {
  baseUrl: string;
  port: number;
  username: string;
  password: string;
  timeout?: number;
}

export interface HikvisionAuthResponse {
  token: string;
  expiresIn: number;
}

export interface HikvisionDoor {
  doorNo: number;
  doorName: string;
  doorType: string;
  readerCount: number;
  status?: {
    online: boolean;
    locked: boolean;
  };
}

export interface HikvisionDoorEvent {
  eventID: string;
  doorNo: number;
  readerNo: number;
  cardNo: string;
  personID: string;
  eventTime: string;
  eventType: string; // entry, exit, forced, etc.
  status: string; // success, failed
  temperature?: number;
}

export interface HikvisionAccessRule {
  accessRuleID: string;
  cardNo: string;
  doorNoList: number[];
  accessLevel: number;
  validFrom: string;
  validTo: string;
  timeScheduleID: string;
}
