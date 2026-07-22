import { mapBackendUser } from '../mappers';

describe('mapBackendUser', () => {
  it('fills sensible defaults for a minimal backend payload', () => {
    const mapped = mapBackendUser({});
    expect(mapped._id).toBeUndefined();
    expect(mapped.username).toBe('');
    expect(mapped.socialMedias).toEqual([]);
    expect(mapped.isPremium).toBe(false);
    expect(mapped.role).toBe('user');
    expect(mapped.status).toBe('green');
    expect(mapped.consent).toEqual({ accepted: false, version: '', consentAt: null });
  });

  it('normalizes id from either _id or id', () => {
    expect(mapBackendUser({ id: 'abc' })._id).toBe('abc');
    expect(mapBackendUser({ _id: 'xyz', id: 'abc' })._id).toBe('xyz');
  });

  it('maps socialNetworks (type/handle) into socialMedias (platform/username)', () => {
    const mapped = mapBackendUser({
      socialNetworks: [{ type: 'instagram', handle: 'foo' }],
    });
    expect(mapped.socialMedias).toEqual([{ platform: 'instagram', username: 'foo' }]);
    expect(mapped.socialMedia).toEqual(mapped.socialMedias);
  });

  it('falls back to a pre-existing socialMedias array when socialNetworks is absent', () => {
    const socialMedias = [{ platform: 'tiktok', username: 'bar' }];
    expect(mapBackendUser({ socialMedias }).socialMedias).toEqual(socialMedias);
  });

  it('prefers profileImageUrl over photo for the photo field', () => {
    expect(mapBackendUser({ profileImageUrl: 'a.jpg', photo: 'b.jpg' }).photo).toBe('a.jpg');
    expect(mapBackendUser({ photo: 'b.jpg' }).photo).toBe('b.jpg');
  });

  it('coerces currentLocation into a string currentPoiId', () => {
    expect(mapBackendUser({ currentLocation: 123 }).currentPoiId).toBe('123');
    expect(mapBackendUser({}).currentPoiId).toBeNull();
  });
});
