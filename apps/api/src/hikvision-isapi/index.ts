export {
  HikvisionIsapiClient,
  IsapiApiError,
  IsapiAuthRejectedError,
  IsapiNotConfiguredError,
  type IsapiClientOpts,
} from './isapi.client';

export {
  controlDoor,
  setChannelAudio,
  setHttpNotificationHost,
  clearHttpNotificationHost,
  enableHumanFieldDetection,
  disableFieldDetection,
  ptzMove,
  ptzStop,
  ptzGoToPreset,
  ptzPresets,
  type PtzPreset,
  describeDevice,
  discoverDevice,
  identifyDevice,
  listProxyChannels,
  listVideoChannels,
  supportsAccessControl,
  supportsPtz,
  type IsapiDeviceIdentity,
  type IsapiDeviceKind,
  type IsapiDiscoveredDevice,
  type IsapiProxyChannel,
  type IsapiVideoChannel,
} from './isapi.discovery';

export {
  describeAcsEvent,
  listAcsEvents,
  listAllUserInfo,
  mapIsapiUserToPersonDto,
  mapMirrorPersonToDto,
  searchAcsEvents,
  searchUserInfo,
  type AcsEventPage,
  type IntegraPersonDto,
  type IsapiAcsEvent,
  type IsapiUserInfo,
  type UserInfoPage,
} from './isapi-acs';

export { probeRtsp, type RtspProbeResult } from './rtsp-probe';

export { asList, parseXml, pick, type XmlValue } from './xml';
