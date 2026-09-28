/** 陨石分类：球粒陨石 / 铁陨石 / 石铁陨石 / 无球粒陨石 */
export type SampleCategory = 'chondrite' | 'iron' | 'stony-iron' | 'achondrite';

/** 化学群：普通球粒 H/L/LL 与铁陨石 IAB；未知时用 ungrouped */
export type ChemicalGroup = 'H' | 'L' | 'LL' | 'IAB' | 'ungrouped';

/** 风化等级 W0（新鲜）→ W4（严重风化） */
export type WeatheringGrade = 'W0' | 'W1' | 'W2' | 'W3' | 'W4';

/** 发现或坠落标记 */
export type FallOrFind = 'fall' | 'find';

/** 存放位置 */
export type StorageLocation = 'cabinet-a' | 'cabinet-b' | 'desiccator' | 'loan-out';

/** 陨石样本（MeteoriteSample） */
export interface MeteoriteSample {
  id: string;
  /** 样本编号，形如 MET-2024-001 */
  sampleNo: string;
  /** 总重量，单位 g */
  totalWeight: number;
  category: SampleCategory;
  chemicalGroup: ChemicalGroup;
  weathering: WeatheringGrade;
  fallOrFind: FallOrFind;
  storage: StorageLocation;
  /** 备注（可选） */
  note?: string;
  /** 分出关系：非空表示该样本是从母样分出的子样（v4 新增，旧记录为 undefined） */
  parentSampleId?: string;
  /** 分出时母样编号快照，母样被删除后仍可追溯来源 */
  parentSampleNo?: string;
  /** 分出重量 g（子样建档时的重量） */
  splitWeight?: number;
  /** 分出时间（毫秒时间戳） */
  splitAt?: number;
  createdAt: number;
  /** v3 升级迁移新增字段 */
  updatedAt: number;
}

/** 分出后母样至少保留 0.1 g，避免母样被分光 */
export const MIN_PARENT_REMAINDER = 0.1;

/** 是否为子样（从母样分出的研究样） */
export function isChildSample(sample: MeteoriteSample): boolean {
  return Boolean(sample.parentSampleId);
}

/** 是否为母样（独立登记、未从其他样本分出） */
export function isParentSample(sample: MeteoriteSample): boolean {
  return !sample.parentSampleId;
}

/**
 * 重量运算后统一保留 4 位小数，规避 1250.4 - 1235 = 15.399999999999977 一类浮点误差。
 * 展示仍走 formatWeight 的 1 位小数。
 */
export function roundWeight(grams: number): number {
  return Math.round((grams + Number.EPSILON) * 10000) / 10000;
}

export const CATEGORY_LABELS: Record<SampleCategory, string> = {
  chondrite: '球粒陨石',
  iron: '铁陨石',
  'stony-iron': '石铁陨石',
  achondrite: '无球粒陨石',
};

export const CHEMICAL_GROUP_LABELS: Record<ChemicalGroup, string> = {
  H: 'H（高铁）',
  L: 'L（低铁）',
  LL: 'LL（低铁低金属）',
  IAB: 'IAB（铁陨石群）',
  ungrouped: '未分群',
};

export const WEATHERING_LABELS: Record<WeatheringGrade, string> = {
  W0: 'W0 新鲜',
  W1: 'W1 轻微',
  W2: 'W2 中等',
  W3: 'W3 明显',
  W4: 'W4 严重',
};

export const FALL_OR_FIND_LABELS: Record<FallOrFind, string> = {
  fall: '目击坠落',
  find: '发现',
};

export const STORAGE_LABELS: Record<StorageLocation, string> = {
  'cabinet-a': 'A 柜 · 干燥剂箱',
  'cabinet-b': 'B 柜 · 常温架',
  desiccator: '真空干燥器',
  'loan-out': '外借中',
};

export const SAMPLE_CATEGORIES: SampleCategory[] = ['chondrite', 'iron', 'stony-iron', 'achondrite'];
export const CHEMICAL_GROUPS: ChemicalGroup[] = ['H', 'L', 'LL', 'IAB', 'ungrouped'];
export const WEATHERING_GRADES: WeatheringGrade[] = ['W0', 'W1', 'W2', 'W3', 'W4'];
export const FALL_OR_FINDS: FallOrFind[] = ['fall', 'find'];
export const STORAGE_LOCATIONS: StorageLocation[] = ['cabinet-a', 'cabinet-b', 'desiccator', 'loan-out'];

/** 分类建议结果 */
export interface ClassificationAdvice {
  category: SampleCategory;
  confidence: 'high' | 'medium' | 'low';
  summary: string;
  hits: string[];
}

/** 样本编号生成：MET-<年>-<三位序号> */
export function generateSampleNo(year: number, seq: number): string {
  return `MET-${year}-${String(seq).padStart(3, '0')}`;
}
