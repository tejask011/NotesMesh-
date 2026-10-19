/**
 * Canvas & Diagram Domain Models
 */

export type CanvasElementType = 
  | 'rectangle' 
  | 'diamond' 
  | 'circle' 
  | 'cylinder'
  | 'cloud'
  | 'hexagon'
  | 'parallelogram'
  | 'actor'
  | 'sticky' 
  | 'text' 
  | 'note-card' 
  | 'connector';

export type ConnectorStyle = 'curved' | 'orthogonal' | 'straight' | 'dashed';
export type ConnectorLineStyle = 'solid' | 'dashed';
export type ArrowHeadType = 'end' | 'both' | 'none';

export interface CanvasElement {
  id: string;
  type: CanvasElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  color?: string; // background or fill
  strokeColor?: string;
  // Specific to note-card
  linkedNoteId?: string;
  linkedNoteTitle?: string;
  // Specific to connector / arrow
  fromId?: string;
  toId?: string;
  fromPoint?: { x: number; y: number };
  toPoint?: { x: number; y: number };
  connectorStyle?: ConnectorStyle;
  connectorLineStyle?: ConnectorLineStyle;
  arrowHeadType?: ArrowHeadType;
}

export interface CanvasDocument {
  id: string;
  title: string;
  elements: CanvasElement[];
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
  gridEnabled: boolean;
  createdAt: number;
  updatedAt: number;
}
