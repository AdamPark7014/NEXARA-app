import { integraCapsFromCounts } from './integra-portfolio.service';

describe('integraCapsFromCounts', () => {
  it('deriva video/ACS/ANPR del inventario espejo', () => {
    const onlyVideo = integraCapsFromCounts({
      cameras: 3,
      doors: 0,
      people: 0,
      devicesAcs: 0,
      devicesEncode: 1,
      vehicles: 0,
    });
    expect(onlyVideo.video).toBe(true);
    expect(onlyVideo.access).toBe(false);
    expect(onlyVideo.anpr).toBe(false);
    expect(onlyVideo.alarms).toBe(true);
    expect(onlyVideo.canControlDoors).toBe(false);

    const acs = integraCapsFromCounts({
      cameras: 0,
      doors: 2,
      people: 5,
      devicesAcs: 1,
      devicesEncode: 0,
      vehicles: 0,
    });
    expect(acs.access).toBe(true);
    expect(acs.events).toBe(true);
    expect(acs.visitors).toBe(true);
    expect(acs.video).toBe(false);
    expect(acs.canControlDoors).toBe(true);
  });

  it('oculta settings para rol cliente', () => {
    const caps = integraCapsFromCounts(
      {
        cameras: 1,
        doors: 1,
        people: 1,
        devicesAcs: 1,
        devicesEncode: 1,
        vehicles: 1,
      },
      null,
      false,
    );
    expect(caps.settings).toBe(false);
    expect(caps.video).toBe(true);
  });

  it('respeta modulesOverride', () => {
    const caps = integraCapsFromCounts(
      {
        cameras: 10,
        doors: 10,
        people: 10,
        devicesAcs: 1,
        devicesEncode: 1,
        vehicles: 10,
      },
      { anpr: false, video: true },
      true,
    );
    expect(caps.anpr).toBe(false);
    expect(caps.video).toBe(true);
  });
});
