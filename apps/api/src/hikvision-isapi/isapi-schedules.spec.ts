import {
  buildAfterHoursWeekPlan,
  buildAlwaysOnWeekPlan,
  buildOfficeHoursWeekPlan,
  buildWeekendWeekPlan,
  buildWeekPlanCfg,
  classifyValid,
  isHhMmSs,
  parseRightPlan,
  validFromMode,
} from './isapi-schedules';

describe('isapi-schedules builders (use cases)', () => {
  it('24/7: 7 días enable 00:00–24:00', () => {
    const cfg = buildAlwaysOnWeekPlan();
    const on = cfg.WeekPlanCfg.filter((s) => s.enable);
    expect(on).toHaveLength(7);
    expect(on.every((s) => s.TimeSegment.endTime === '24:00:00')).toBe(true);
    expect(isHhMmSs('24:00:00')).toBe(true);
  });

  it('weekly office: Lun–Vie 08–18, fin de semana off', () => {
    const cfg = buildOfficeHoursWeekPlan();
    const on = cfg.WeekPlanCfg.filter((s) => s.enable);
    expect(on).toHaveLength(5);
    expect(on.map((s) => s.week)).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
    ]);
    expect(cfg.WeekPlanCfg.filter((s) => s.week === 'Saturday' && s.enable)).toHaveLength(0);
  });

  it('after-hours: overnight en 2 franjas (sin begin>end en un slot)', () => {
    const cfg = buildAfterHoursWeekPlan();
    const monday = cfg.WeekPlanCfg.filter((s) => s.week === 'Monday' && s.enable);
    expect(monday).toHaveLength(2);
    expect(monday[0].TimeSegment).toEqual({ beginTime: '18:00:00', endTime: '24:00:00' });
    expect(monday[1].TimeSegment).toEqual({ beginTime: '00:00:00', endTime: '08:00:00' });
    for (const s of monday) {
      // 24:00:00 cuenta como fin de día ≥ begin
      const begin = s.TimeSegment.beginTime;
      const end = s.TimeSegment.endTime;
      expect(begin <= end || end === '24:00:00').toBe(true);
    }
  });

  it('weekend only Sat+Sun', () => {
    const cfg = buildWeekendWeekPlan();
    const on = cfg.WeekPlanCfg.filter((s) => s.enable);
    expect(on.map((s) => s.week).sort()).toEqual(['Saturday', 'Sunday']);
  });

  it('empty enabled list → 56 slots apagados', () => {
    const cfg = buildWeekPlanCfg([]);
    expect(cfg.WeekPlanCfg).toHaveLength(56);
    expect(cfg.WeekPlanCfg.every((s) => !s.enable)).toBe(true);
  });

  it('rechaza franja con hora inválida', () => {
    expect(() =>
      buildWeekPlanCfg([{ week: 'Monday', beginTime: '8:00', endTime: '18:00:00' }]),
    ).toThrow(/Franja inválida/);
  });
});

describe('isapi-schedules Valid + RightPlan', () => {
  it('indefinite / window / disabled', () => {
    expect(
      classifyValid({
        enable: true,
        beginTime: '2020-01-01T00:00:00',
        endTime: '2037-12-31T23:59:59',
      }),
    ).toBe('indefinite');
    expect(
      classifyValid({
        enable: true,
        beginTime: '2026-09-04T00:00:00',
        endTime: '2026-09-04T23:59:59',
      }),
    ).toBe('window');
    expect(classifyValid({ enable: false })).toBe('disabled');
  });

  it('validFromMode window exige begin/end', () => {
    expect(() => validFromMode('window')).toThrow(/beginTime/);
    const v = validFromMode('window', {
      beginTime: '2026-01-01T00:00:00',
      endTime: '2026-12-31T23:59:59',
    });
    expect(v.enable).toBe(true);
    expect(v.timeType).toBe('local');
  });

  it('parseRightPlan vacío / per-door', () => {
    expect(parseRightPlan(null)).toEqual([]);
    expect(parseRightPlan([{ doorNo: 1, planTemplateNo: '2' }])).toEqual([
      { doorNo: 1, planTemplateNo: '2' },
    ]);
  });
});
