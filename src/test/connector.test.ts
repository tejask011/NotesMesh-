import { describe, it, expect } from 'vitest';
import {
  getConnectorAppearance,
  buildConnectorPath,
  ConnectorGeometry,
} from '../core/canvas/connectorAppearance';

describe('connector appearance', () => {
  it('defaults to a solid curved line with a target arrowhead', () => {
    const appearance = getConnectorAppearance({});

    expect(appearance.geometry).toBe('curved');
    expect(appearance.dashed).toBe(false);
    expect(appearance.markerStart).toBe(false);
    expect(appearance.markerEnd).toBe(true);
  });

  it('draws both markers for bidirectional connectors', () => {
    const appearance = getConnectorAppearance({ arrowHeadType: 'both' });

    expect(appearance.markerStart).toBe(true);
    expect(appearance.markerEnd).toBe(true);
  });

  it('removes every marker when arrowheads are off', () => {
    const appearance = getConnectorAppearance({ arrowHeadType: 'none' });

    expect(appearance.markerStart).toBe(false);
    expect(appearance.markerEnd).toBe(false);
  });

  it('combines a dashed stroke with every geometry', () => {
    const geometries: ConnectorGeometry[] = ['curved', 'orthogonal', 'straight'];

    for (const geometry of geometries) {
      const appearance = getConnectorAppearance({
        connectorStyle: geometry,
        connectorLineStyle: 'dashed',
      });

      expect(appearance.geometry).toBe(geometry);
      expect(appearance.dashed).toBe(true);
      expect(appearance.markerEnd).toBe(true);
    }
  });

  it('treats the legacy dashed style as a dashed straight line', () => {
    const appearance = getConnectorAppearance({ connectorStyle: 'dashed' });

    expect(appearance.geometry).toBe('straight');
    expect(appearance.dashed).toBe(true);
  });

  it('lets an explicit line style override the legacy dashed value', () => {
    const appearance = getConnectorAppearance({
      connectorStyle: 'dashed',
      connectorLineStyle: 'solid',
    });

    expect(appearance.geometry).toBe('straight');
    expect(appearance.dashed).toBe(false);
  });

  it('falls back to a solid curve for an unknown style', () => {
    const appearance = getConnectorAppearance({
      connectorStyle: 'unknown' as never,
    });

    expect(appearance.geometry).toBe('curved');
    expect(appearance.dashed).toBe(false);
  });
});

describe('connector path geometry', () => {
  const from = { x: 10, y: 20 };
  const to = { x: 210, y: 120 };

  it('builds a straight segment', () => {
    expect(buildConnectorPath('straight', from, to)).toBe('M 10 20 L 210 120');
  });

  it('builds an orthogonal path with a midpoint step', () => {
    const path = buildConnectorPath('orthogonal', from, to);

    expect(path).toBe('M 10 20 L 110 20 L 110 120 L 210 120');
    expect(path.match(/L/g)).toHaveLength(3);
  });

  it('builds a cubic curve with a horizontal midpoint control pair', () => {
    const path = buildConnectorPath('curved', from, to);

    expect(path).toBe('M 10 20 C 110 20, 110 120, 210 120');
    expect(path).toContain('C');
  });
});
