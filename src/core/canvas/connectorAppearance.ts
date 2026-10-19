import { CanvasElement, ConnectorStyle } from '../domain/canvas';

export type ConnectorGeometry = 'curved' | 'orthogonal' | 'straight';

export interface ConnectorAppearance {
  geometry: ConnectorGeometry;
  dashed: boolean;
  markerStart: boolean;
  markerEnd: boolean;
}

type ConnectorStyleFields = Pick<
  CanvasElement,
  'connectorStyle' | 'connectorLineStyle' | 'arrowHeadType'
>;

function resolveGeometry(style: ConnectorStyle | undefined): ConnectorGeometry {
  if (style === 'orthogonal' || style === 'straight') return style;
  // 'dashed' is a legacy value that used to double as a geometry. Anything
  // unknown also falls back to the default curve.
  return style === 'dashed' ? 'straight' : 'curved';
}

/**
 * Resolves how a connector should be drawn. Dash pattern and arrowheads are
 * independent of the path geometry, which keeps every combination valid.
 */
export function getConnectorAppearance(element: ConnectorStyleFields): ConnectorAppearance {
  const legacyDashed = element.connectorStyle === 'dashed';
  const dashed =
    element.connectorLineStyle === undefined
      ? legacyDashed
      : element.connectorLineStyle === 'dashed';

  const head = element.arrowHeadType || 'end';

  return {
    geometry: resolveGeometry(element.connectorStyle),
    dashed,
    markerStart: head === 'both',
    markerEnd: head !== 'none',
  };
}

export function buildConnectorPath(
  geometry: ConnectorGeometry,
  from: { x: number; y: number },
  to: { x: number; y: number }
): string {
  if (geometry === 'straight') {
    return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  }

  if (geometry === 'orthogonal') {
    const midX = (from.x + to.x) / 2;
    return `M ${from.x} ${from.y} L ${midX} ${from.y} L ${midX} ${to.y} L ${to.x} ${to.y}`;
  }

  const midX = (from.x + to.x) / 2;
  return `M ${from.x} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x} ${to.y}`;
}
