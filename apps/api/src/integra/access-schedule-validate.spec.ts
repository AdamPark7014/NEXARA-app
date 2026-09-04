import {
  ACCESS_SCHEDULE_TZ,
  formatMexicoValidLocal,
  mexicoTodayBounds,
  splitOvernightSegment,
  useCaseCoverageMatrix,
  validateRightPlan,
  validateValidWindow,
  validateWeekPlanCfg,
} from './access-schedule-validate';
import { buildAfterHoursWeekPlan, buildWeekPlanCfg } from '../hikvision-isapi/isapi-schedules';

describe('access-schedule-validate', () => {
  it('timezone Mexico: visitor day bounds no usan UTC del contenedor', () => {
    // 2026-09-05 02:30 UTC = 2026-09-04 20:30 en CDMX (UTC-6)
    const instant = new Date('2026-09-05T02:30:00.000Z');
    const bounds = mexicoTodayBounds(instant);
    expect(ACCESS_SCHEDULE_TZ).toMatch(/Mexico/);
    expect(bounds.dayKey).toBe('2026-09-04');
    expect(bounds.beginTime).toBe('2026-09-04T00:00:00');
    expect(bounds.endTime).toBe('2026-09-04T23:59:59');
    expect(formatMexicoValidLocal(instant)).toBe('2026-09-04T20:30:00');
  });

  it('overnight end<begin → 2 franjas', () => {
    const segs = splitOvernightSegment({
      week: 'Monday',
      beginTime: '22:00:00',
      endTime: '05:00:00',
    });
    expect(segs).toEqual([
      { week: 'Monday', id: 1, beginTime: '22:00:00', endTime: '23:59:59' },
      { week: 'Monday', id: 2, beginTime: '00:00:00', endTime: '05:00:00' },
    ]);
  });

  it('detecta overnight sin partir en WeekPlanCfg', () => {
    const bad = buildWeekPlanCfg([
      { week: 'Monday', id: 1, beginTime: '22:00:00', endTime: '05:00:00' },
    ]);
    const issues = validateWeekPlanCfg(bad);
    expect(issues.some((i) => i.code === 'overnight_unsplit')).toBe(true);
  });

  it('after-hours builder pasa validación', () => {
    expect(validateWeekPlanCfg(buildAfterHoursWeekPlan())).toEqual([]);
  });

  it('Valid end < begin', () => {
    const issues = validateValidWindow({
      enable: true,
      beginTime: '2026-09-10T00:00:00',
      endTime: '2026-09-01T00:00:00',
    });
    expect(issues.some((i) => i.code === 'end_before_begin')).toBe(true);
  });

  it('RightPlan vacío: error salvo allowEmpty', () => {
    expect(validateRightPlan([]).some((i) => i.code === 'empty_right_plan')).toBe(true);
    expect(validateRightPlan([], { allowEmpty: true })).toEqual([]);
  });

  it('matriz de casos de uso: todos cubiertos', () => {
    const matrix = useCaseCoverageMatrix();
    const failed = matrix.filter((r) => !r.ok);
    expect(failed).toEqual([]);
    expect(matrix.map((r) => r.id)).toEqual(
      expect.arrayContaining([
        'indefinite',
        'dated',
        'weekly',
        'per_door',
        'visitor',
        'contractor',
        'disabled',
        'always_247',
        'after_hours',
        'weekend',
        'empty_plans',
        'overnight_split',
        'timezone_mx',
      ]),
    );
  });
});
