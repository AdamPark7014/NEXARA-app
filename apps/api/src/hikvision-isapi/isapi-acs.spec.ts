import {
  describeAcsEvent,
  type IsapiAcsEvent,
} from './isapi-acs';

describe('isapi-acs helpers', () => {
  it('describeAcsEvent labels common major/minor', () => {
    expect(describeAcsEvent({ major: 5, minor: 75 })).toBe('Acceso concedido');
    expect(describeAcsEvent({ major: 5, minor: 38 })).toBe('Acceso denegado');
    expect(describeAcsEvent({ major: 1, minor: 3 } as IsapiAcsEvent)).toMatch(/Alarma/);
  });
});
