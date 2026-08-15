import { isPublicUploadPath, readUploadToken } from './uploads-access.js';

describe('uploads access control', () => {
  describe('isPublicUploadPath', () => {
    it('allows the marketing subdirectories', () => {
      expect(isPublicUploadPath('/hero/slide-1.jpg')).toBe(true);
      expect(isPublicUploadPath('/page-media/about.png')).toBe(true);
      expect(isPublicUploadPath('/news/2026/post.jpg')).toBe(true);
      expect(isPublicUploadPath('/case-studies/acme.pdf')).toBe(true);
    });

    it('denies internal material', () => {
      expect(isPublicUploadPath('/cvs/candidate-12.pdf')).toBe(false);
      expect(isPublicUploadPath('/employee-payments/nomina.pdf')).toBe(false);
      expect(isPublicUploadPath('/clients/contract.pdf')).toBe(false);
      expect(isPublicUploadPath('/evidences/photo.jpg')).toBe(false);
      expect(isPublicUploadPath('/user-docs/ine.jpg')).toBe(false);
    });

    it('denies unknown directories by default', () => {
      expect(isPublicUploadPath('/some-new-feature/file.pdf')).toBe(false);
      expect(isPublicUploadPath('/')).toBe(false);
      expect(isPublicUploadPath('')).toBe(false);
    });

    it('does not let a public prefix be faked via traversal', () => {
      expect(isPublicUploadPath('/hero/../cvs/candidate-12.pdf')).toBe(false);
      expect(isPublicUploadPath('/hero/%2e%2e/cvs/candidate-12.pdf')).toBe(false);
      expect(isPublicUploadPath('/hero\\..\\cvs\\candidate-12.pdf')).toBe(false);
      expect(isPublicUploadPath('/../hero/slide.jpg')).toBe(false);
    });

    it('rejects malformed percent-encoding instead of throwing', () => {
      expect(isPublicUploadPath('/hero/%E0%A4%A.jpg')).toBe(false);
    });

    it('ignores the query string', () => {
      expect(isPublicUploadPath('/hero/slide.jpg?v=2')).toBe(true);
      expect(isPublicUploadPath('/cvs/x.pdf?dir=hero')).toBe(false);
    });
  });

  describe('readUploadToken', () => {
    it('prefers the Authorization header', () => {
      expect(readUploadToken({ authorization: 'Bearer abc.def.ghi' })).toBe('abc.def.ghi');
    });

    it('falls back to the shared session cookie', () => {
      // <img src="/uploads/..."> never carries an Authorization header.
      expect(readUploadToken({ cookie: 'nexara_token=abc.def.ghi' })).toBe('abc.def.ghi');
      expect(
        readUploadToken({ cookie: 'nx_session=1; nexara_token=abc.def.ghi; panel=erp' }),
      ).toBe('abc.def.ghi');
    });

    it('url-decodes the cookie value', () => {
      expect(readUploadToken({ cookie: 'nexara_token=a%2Bb%2Fc' })).toBe('a+b/c');
    });

    it('returns null when no credential is present', () => {
      expect(readUploadToken({})).toBeNull();
      expect(readUploadToken({ cookie: 'nx_session=1; panel=erp' })).toBeNull();
      expect(readUploadToken({ cookie: 'nexara_token=' })).toBeNull();
      expect(readUploadToken({ authorization: 'Basic dXNlcjpwYXNz' })).toBeNull();
      expect(readUploadToken({ authorization: 'Bearer    ' })).toBeNull();
    });

    it('does not confuse a cookie whose name merely ends in the session name', () => {
      expect(readUploadToken({ cookie: 'not_nexara_token=evil' })).toBeNull();
    });
  });
});
