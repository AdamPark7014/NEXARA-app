/** Tipos crudos Artemis (solo campos documentados en Postman / Developer Guide). */

export type ArtemisList<T> = { list?: T[]; total?: number };

export type ArtemisDoorRaw = {
  doorIndexCode?: string;
  doorName?: string;
  doorNo?: number | string;
  regionName?: string;
  regionIndexCode?: string;
  channelType?: string;
  doorState?: number | string;
  online?: boolean;
};

export type ArtemisEventRaw = {
  eventId?: string;
  doorIndexCode?: string;
  doorName?: string;
  cardNo?: string;
  personId?: string;
  personName?: string;
  eventTime?: string;
  eventType?: number | string;
  eventTypeName?: string;
};

export type ArtemisCameraRaw = {
  cameraIndexCode?: string;
  cameraName?: string;
  channelNo?: string | number;
  regionIndexCode?: string;
  regionName?: string;
  status?: number | string;
  encodeDevIndexCode?: string;
};

export type ArtemisPreviewData = {
  url?: string;
};

export type ArtemisOrgRaw = {
  orgIndexCode?: string;
  orgName?: string;
  parentOrgIndexCode?: string;
};

export type ArtemisPersonRaw = {
  personId?: string;
  personName?: string;
  personCode?: string;
  orgIndexCode?: string;
  orgName?: string;
};

export type ArtemisPrivilegeGroupRaw = {
  privilegeGroupId?: string;
  privilegeGroupName?: string;
  description?: string;
};

export type ArtemisDeviceRaw = {
  indexCode?: string;
  name?: string;
  ip?: string;
  online?: boolean;
  deviceType?: string;
};

export type ArtemisVehicleRaw = {
  vehicleId?: string;
  plateNo?: string;
  personId?: string;
  personName?: string;
};

export type ArtemisRegionRaw = {
  indexCode?: string;
  name?: string;
  parentIndexCode?: string;
  treeCode?: string;
};

/** doorState documentado: 0 remain open, 1 closed, 2 open, 3 remain closed, 4 offline */
export const ARTEMIS_DOOR_STATE: Record<string, string> = {
  '0': 'remain_open',
  '1': 'closed',
  '2': 'open',
  '3': 'remain_closed',
  '4': 'offline',
};

/** doControl controlType: 0 remain open, 1 close, 2 open, 3 remain closed */
export const ARTEMIS_DOOR_CONTROL = {
  REMAIN_OPEN: '0',
  CLOSE: '1',
  OPEN: '2',
  REMAIN_CLOSED: '3',
} as const;
