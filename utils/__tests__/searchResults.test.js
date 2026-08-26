import { mergeSearchResults } from '../searchResults';

describe('mergeSearchResults', () => {
  it('prioritizes locations (already distance-sorted by the backend) ahead of users', () => {
    const users = [{ _type: 'user', _id: 'u1' }, { _type: 'user', _id: 'u2' }];
    const locations = [{ _type: 'location', _id: 'l1' }, { _type: 'location', _id: 'l2' }];

    const merged = mergeSearchResults(users, locations, 10);

    expect(merged.map((r) => r._id)).toEqual(['l1', 'l2', 'u1', 'u2']);
  });

  it('caps the combined result at the given limit', () => {
    const users = [{ _id: 'u1' }, { _id: 'u2' }, { _id: 'u3' }];
    const locations = [{ _id: 'l1' }, { _id: 'l2' }, { _id: 'l3' }];

    const merged = mergeSearchResults(users, locations, 5);

    expect(merged).toHaveLength(5);
    expect(merged.map((r) => r._id)).toEqual(['l1', 'l2', 'l3', 'u1', 'u2']);
  });

  it('handles an empty locations list', () => {
    const users = [{ _id: 'u1' }];
    expect(mergeSearchResults(users, [], 5).map((r) => r._id)).toEqual(['u1']);
  });
});
