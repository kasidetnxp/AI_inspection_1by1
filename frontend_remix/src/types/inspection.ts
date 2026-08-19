export interface ProbeMark {
  dx: number;
  dy: number;
  rx: number;
  ry: number;
  rot: number;
  isScratch?: boolean;
}

export interface DiePad {
  id: number;
  x: number;
  y: number;
  detected: boolean;
  marks: ProbeMark[];
}

export interface GrainItem {
  x: number;
  y: number;
  radius: number;
}

export interface DieData {
  pads: DiePad[];
  grains: GrainItem[];
}

export interface AlarmItem {
  name: string;
  time: string;
}

export interface InspectionRecord {
  id: string;
  timestamp?: string;
  timeShort?: string;
  padsTotal: number;
  padsDetected: number;
  probeMarks: number;
  grains: number;
  confidence: number;
  inferenceTime: number;
  ruleTime: number;
  decision: string;
  machineAction: string;
  imageUrl?: string | null;
  rawImageUrl?: string | null;
  marks?: ProbeMark[];
  grainList?: GrainItem[];
  alarms?: AlarmItem[];
}

export interface SystemStats {
  cpu: number;
  npu: number;
  ram: number;
  temp: number;
}

export interface ModelItem {
  name: string;
  version: string;
  engine: string;
  size: string;
  accuracy: string;
  active: boolean;
}

export interface ClassModeConfigResponse {
  class_mode: number;
  status?: string;
}
