import type { StorageLocation } from './sample';

/** 母样分样后允许保留的最小重量，单位 g（低于该值不允许再分） */
export const MIN_PARENT_REMAINING_WEIGHT = 0.1;

/** 重量比较精度（规避浮点误差），单位 g */
export const WEIGHT_EPSILON = 1e-6;

/**
 * 分出关系（SplitRecord）：
 * 一次“分出子样”产生一条记录，子样本身仍是 MeteoriteSample（parentId 指向母样）。
 * 母样 totalWeight 在分样时扣减 splitWeight，因此母样重量 = 原始重量 - 各子样 splitWeight 之和。
 */
export interface SplitRecord {
  id: string;
  /** 母样 id */
  parentId: string;
  /** 子样 id（指向 samples 表中的新样本） */
  childId: string;
  /** 分取重量，单位 g */
  splitWeight: number;
  /** 分样时子样的存放位置（冗余记录，子样日后挪位不影响关系凭证） */
  storage: StorageLocation;
  createdAt: number;
}

/** 子样建议编号：母样编号后追加 -01、-02 … */
export function suggestChildSampleNo(parentSampleNo: string, existingCount: number): string {
  return `${parentSampleNo}-${String(existingCount + 1).padStart(2, '0')}`;
}
