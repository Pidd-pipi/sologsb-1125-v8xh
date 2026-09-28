import { create } from 'zustand';
import { db, makeId, seedIfEmpty } from '../db';
import type { AnalysisRecord } from '../types/analysis';
import type { FindRecord } from '../types/find';
import type { MeteoriteSample, StorageLocation } from '../types/sample';
import type { ThinSection } from '../types/section';
import {
  MIN_PARENT_REMAINING_WEIGHT,
  WEIGHT_EPSILON,
  type SplitRecord,
} from '../types/split';

export interface SplitSampleInput {
  parentId: string;
  childSampleNo: string;
  /** 分取重量，单位 g */
  splitWeight: number;
  storage: StorageLocation;
  note?: string;
}

export type SplitResult = { ok: true; childId: string } | { ok: false; error: string };

export interface SampleState {
  samples: MeteoriteSample[];
  finds: FindRecord[];
  sections: ThinSection[];
  analysis: AnalysisRecord[];
  splits: SplitRecord[];
  loading: boolean;
  loaded: boolean;
  loadAll: () => Promise<void>;
  addSample: (input: Omit<MeteoriteSample, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateSample: (id: string, patch: Partial<MeteoriteSample>) => Promise<void>;
  removeSample: (id: string) => Promise<void>;
  addFind: (input: Omit<FindRecord, 'id' | 'createdAt'>) => Promise<string>;
  addSection: (input: Omit<ThinSection, 'id' | 'createdAt'>) => Promise<string>;
  updateSection: (id: string, patch: Partial<ThinSection>) => Promise<void>;
  addAnalysis: (input: Omit<AnalysisRecord, 'id' | 'createdAt'>) => Promise<string>;
  /** 从母样分出子样：编号唯一、重量与剩余下限校验通过后，原子扣减母样重量并落分出关系 */
  splitSample: (input: SplitSampleInput) => Promise<SplitResult>;
  nextSampleSeq: () => number;
}

export const useSampleStore = create<SampleState>((set, get) => ({
  samples: [],
  finds: [],
  sections: [],
  analysis: [],
  splits: [],
  loading: false,
  loaded: false,

  loadAll: async () => {
    set({ loading: true });
    await seedIfEmpty();
    const [samples, finds, sections, analysis, splits] = await Promise.all([
      db.samples.toArray(),
      db.finds.toArray(),
      db.sections.toArray(),
      db.analysis.toArray(),
      db.splits.toArray(),
    ]);
    samples.sort((a, b) => b.createdAt - a.createdAt);
    finds.sort((a, b) => b.createdAt - a.createdAt);
    sections.sort((a, b) => b.createdAt - a.createdAt);
    analysis.sort((a, b) => b.createdAt - a.createdAt);
    splits.sort((a, b) => b.createdAt - a.createdAt);
    set({ samples, finds, sections, analysis, splits, loading: false, loaded: true });
  },

  addSample: async (input) => {
    const now = Date.now();
    const record: MeteoriteSample = { ...input, id: makeId('sample'), createdAt: now, updatedAt: now };
    await db.samples.add(record);
    set({ samples: [record, ...get().samples] });
    return record.id;
  },

  updateSample: async (id, patch) => {
    const updatedAt = Date.now();
    await db.samples.update(id, { ...patch, updatedAt });
    set({
      samples: get().samples.map((s) => (s.id === id ? { ...s, ...patch, updatedAt } : s)),
    });
  },

  removeSample: async (id) => {
    // 母样被删时，子样转为独立样本（清掉来源指针），保证旧子样仍可正常打开
    const now = Date.now();
    await db.transaction(
      'rw',
      db.samples,
      db.finds,
      db.sections,
      db.analysis,
      db.splits,
      async () => {
        await db.samples.delete(id);
        await db.samples
          .where('parentId')
          .equals(id)
          .modify((child) => {
            delete child.parentId;
            child.updatedAt = now;
          });
        await db.finds.where('sampleId').equals(id).delete();
        await db.sections.where('sampleId').equals(id).delete();
        await db.analysis.where('sampleId').equals(id).delete();
        await db.splits.where('parentId').equals(id).delete();
        await db.splits.where('childId').equals(id).delete();
      },
    );
    set({
      samples: get()
        .samples.filter((s) => s.id !== id)
        .map((s) => (s.parentId === id ? { ...s, parentId: undefined, updatedAt: now } : s)),
      finds: get().finds.filter((f) => f.sampleId !== id),
      sections: get().sections.filter((s) => s.sampleId !== id),
      analysis: get().analysis.filter((a) => a.sampleId !== id),
      splits: get().splits.filter((sp) => sp.parentId !== id && sp.childId !== id),
    });
  },

  addFind: async (input) => {
    const record: FindRecord = { ...input, id: makeId('find'), createdAt: Date.now() };
    await db.finds.add(record);
    set({ finds: [record, ...get().finds] });
    return record.id;
  },

  addSection: async (input) => {
    const record: ThinSection = { ...input, id: makeId('section'), createdAt: Date.now() };
    await db.sections.add(record);
    set({ sections: [record, ...get().sections] });
    return record.id;
  },

  updateSection: async (id, patch) => {
    await db.sections.update(id, patch);
    set({ sections: get().sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  },

  addAnalysis: async (input) => {
    const record: AnalysisRecord = { ...input, id: makeId('analysis'), createdAt: Date.now() };
    await db.analysis.add(record);
    set({ analysis: [record, ...get().analysis] });
    return record.id;
  },

  splitSample: async (input) => {
    const childSampleNo = input.childSampleNo.trim();
    const splitWeight = Number(input.splitWeight);

    if (!childSampleNo) return { ok: false, error: '子样编号不能为空' };
    if (!Number.isFinite(splitWeight) || splitWeight <= 0) {
      return { ok: false, error: '分取重量需为大于 0 的数字' };
    }
    const parent = await db.samples.get(input.parentId);
    if (!parent) return { ok: false, error: '母样不存在或已被删除' };
    if (parent.parentId) return { ok: false, error: '子样不能再分出子样' };
    if (splitWeight > parent.totalWeight + WEIGHT_EPSILON) {
      return { ok: false, error: `分取重量超过母样剩余重量（剩余 ${parent.totalWeight} g）` };
    }
    if (parent.totalWeight - splitWeight + WEIGHT_EPSILON < MIN_PARENT_REMAINING_WEIGHT) {
      return {
        ok: false,
        error: `分取后母样剩余不得少于 ${MIN_PARENT_REMAINING_WEIGHT} g，请减小分取重量`,
      };
    }

    const now = Date.now();
    const childId = makeId('sample');
    const splitId = makeId('split');
    const remaining = Math.round((parent.totalWeight - splitWeight) * 1e6) / 1e6;

    try {
      await db.transaction('rw', db.samples, db.splits, async () => {
        // 事务内复查，防止并发/多标签页下编号重复与重量被改
        const latest = await db.samples.get(input.parentId);
        if (!latest || latest.parentId) throw new Error('母样状态已变化，请刷新后重试');
        const dup = await db.samples.where('sampleNo').equals(childSampleNo).first();
        if (dup) throw new Error('样本编号已存在，同一编号不能重复');
        if (splitWeight > latest.totalWeight + WEIGHT_EPSILON) {
          throw new Error(`分取重量超过母样剩余重量（剩余 ${latest.totalWeight} g）`);
        }
        if (latest.totalWeight - splitWeight + WEIGHT_EPSILON < MIN_PARENT_REMAINING_WEIGHT) {
          throw new Error(`分取后母样剩余不得少于 ${MIN_PARENT_REMAINING_WEIGHT} g`);
        }

        const child: MeteoriteSample = {
          id: childId,
          sampleNo: childSampleNo,
          totalWeight: splitWeight,
          category: latest.category,
          chemicalGroup: latest.chemicalGroup,
          weathering: latest.weathering,
          fallOrFind: latest.fallOrFind,
          storage: input.storage,
          note: input.note?.trim() || undefined,
          parentId: latest.id,
          createdAt: now,
          updatedAt: now,
        };
        const split: SplitRecord = {
          id: splitId,
          parentId: latest.id,
          childId,
          splitWeight,
          storage: input.storage,
          createdAt: now,
        };
        await db.samples.add(child);
        await db.samples.update(latest.id, { totalWeight: remaining, updatedAt: now });
        await db.splits.add(split);
      });
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : '分出子样失败' };
    }

    const updatedParent: MeteoriteSample = { ...parent, totalWeight: remaining, updatedAt: now };
    const child: MeteoriteSample = {
      id: childId,
      sampleNo: childSampleNo,
      totalWeight: splitWeight,
      category: parent.category,
      chemicalGroup: parent.chemicalGroup,
      weathering: parent.weathering,
      fallOrFind: parent.fallOrFind,
      storage: input.storage,
      note: input.note?.trim() || undefined,
      parentId: parent.id,
      createdAt: now,
      updatedAt: now,
    };
    const split: SplitRecord = {
      id: splitId,
      parentId: parent.id,
      childId,
      splitWeight,
      storage: input.storage,
      createdAt: now,
    };
    set({
      samples: [
        child,
        ...get().samples.map((s) => (s.id === parent.id ? updatedParent : s)),
      ],
      splits: [split, ...get().splits],
    });
    return { ok: true, childId };
  },

  nextSampleSeq: () => {
    const year = new Date().getFullYear();
    const prefix = `MET-${year}-`;
    const used = get()
      .samples.map((s) => s.sampleNo)
      .filter((no) => no.startsWith(prefix))
      .map((no) => Number(no.slice(prefix.length)))
      .filter((n) => Number.isFinite(n));
    const max = used.length ? Math.max(...used) : 0;
    return max + 1;
  },
}));
