import { buildQuery, normalize } from '../OverpassService';

describe('OverpassService.buildQuery', () => {
  it('queries node + way + relation (nwr) so polygon-mapped venues are included', () => {
    const q = buildQuery({ lat: 48.7579, lon: 2.3484, radius: 2000, vibe: 'moon' });
    expect(q).toContain('nwr["amenity"~"^(bar|pub|biergarten|nightclub)$"](around:2000,48.7579,2.3484);');
    expect(q).not.toMatch(/\bnode\["amenity"/);
    expect(q).toContain('out center;');
  });
});

describe('OverpassService.normalize', () => {
  it('keeps a way-mapped nightclub (e.g. Loft Métropolis) using its center point', () => {
    const out = normalize([
      {
        type: 'way',
        id: 126103331,
        center: { lat: 48.7579625, lon: 2.3484384 },
        tags: { name: 'Loft Métropolis', amenity: 'nightclub' },
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      _id: 'osm:126103331',
      name: 'Loft Métropolis',
      type: 'nightclub',
      location: { type: 'Point', coordinates: [2.3484384, 48.7579625] },
      source: 'osm',
    });
  });

  it('still handles plain nodes', () => {
    const out = normalize([
      { type: 'node', id: 1, lat: 48.85, lon: 2.35, tags: { name: 'Bar X', amenity: 'bar' } },
    ]);
    expect(out[0].location.coordinates).toEqual([2.35, 48.85]);
  });

  it('drops way/relation without a resolvable center', () => {
    const out = normalize([
      { type: 'relation', id: 9, tags: { name: 'No geometry', amenity: 'nightclub' } },
    ]);
    expect(out).toEqual([]);
  });

  it('drops unnamed elements', () => {
    const out = normalize([
      { type: 'way', id: 2, center: { lat: 1, lon: 2 }, tags: { amenity: 'nightclub' } },
    ]);
    expect(out).toEqual([]);
  });
});
