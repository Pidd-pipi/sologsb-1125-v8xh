import { create } from 'zustand';
import { db, makeId, seedIfEmpty } from '../db';
import type { AnalysisRecord } from '../types/analysis';
import type { FindRecord } from '../types/find';
import {
  MIN_PARENT_REMAINDER,
  roundWeight,
  type MeteoriteSample,
  type StorageLocation,
} from '../types/sample';
import type { ThinSection } from '../types/section';

/** 分出子样的入参：编号、分取重量、存放位置（其余属性继承母样） */
export interface SplitChildInput {
  parentId: string;
  sampleNo: string;
  splitWeight: number;
  storage: StorageLocation;
  note?: string;
}

export interface SampleState {
  samples: MeteoriteSample[];
  finds: FindRecord[];
  sections: ThinSection[];
  analysis: AnalysisRecord[];
  loading: boolean;
  loaded: boolean;
  loadAll: () => Promise<void>;
  addSample: (input: Omit<MeteoriteSample, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateSample: (id: string, patch: Partial<MeteoriteSample>) => Promise<void>;
  removeSample: (id: string) => Promise<void>;
  splitChildSample: (input: SplitChildInput) => Promise<string>;
  addFind: (input: Omit<FindRecord, 'id' | 'createdAt'>) => Promise<string>;
  addSection: (input: Omit<ThinSection, 'id' | 'createdAt'>) => Promise<string>;
  updateSection: (id: string, patch: Partial<ThinSection>) => Promise<void>;
  addAnalysis: (input: Omit<AnalysisRecord, 'id' | 'createdAt'>) => Promise<string>;
  nextSampleSeq: () => number;
}

export const useSampleStore = create<SampleState>((set, get) => ({
  samples: [],
  finds: [],
  sections: [],
  analysis: [],
  loading: false,
  loaded: false,

  loadAll: async () => {
    set({ loading: true });
    await seedIfEmpty();
    const [samples, finds, sections, analysis] = await Promise.all([
      db.samples.toArray(),
      db.finds.toArray(),
      db.sections.toArray(),
      db.analysis.toArray(),
    ]);
    samples.sort((a, b) => b.createdAt - a.createdAt);
    finds.sort((a, b) => b.createdAt - a.createdAt);
    sections.sort((a, b) => b.createdAt - a.createdAt);
    analysis.sort((a, b) => b.createdAt - a.createdAt);
    set({ samples, finds, sections, analysis, loading: false, loaded: true });
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
    await db.transaction('rw', db.samples, db.finds, db.sections, db.analysis, async () => {
      await db.samples.delete(id);
      await db.finds.where('sampleId').equals(id).delete();
      await db.sections.where('sampleId').equals(id).delete();
      await db.analysis.where('sampleId').equals(id).delete();
    });
    set({
      samples: get().samples.filter((s) => s.id !== id),
      finds: get().finds.filter((f) => f.sampleId !== id),
      sections: get().sections.filter((s) => s.sampleId !== id),
      analysis: get().analysis.filter((a) => a.sampleId !== id),
    });
  },

  splitChildSample: async (input) => {
    const sampleNo = input.sampleNo.trim();
    const weight = Number(input.splitWeight);

    // 事务外先做静态校验；母样状态、编号唯一、重量扣减在事务内复查并落库
    if (!sampleNo) throw new Error('子样编号不能为空');
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new Error('分取重量需大于 0 g');
    }

    let childId = '';
    await db.transaction('rw', db.samples, async () => {
      const parent = await db.samples.get(input.parentId);
      if (!parent) throw new Error('母样不存在或已被删除');
      if (parent.parentSampleId) {
        throw new Error('研究子样不能再次分出，请到最初的母样详情操作');
      }

      const dup = await db.samples.where('sampleNo').equals(sampleNo).first();
      if (dup) throw new Error(`编号「${sampleNo}」已存在，同一编号不能重复`);

      const remainder = roundWeight(parent.totalWeight - weight);
      if (remainder < 0) {
        throw new Error(`分取重量超过母样剩余重量（剩余 ${parent.totalWeight} g），无法保存`);
      }
      if (remainder < MIN_PARENT_REMAINDER) {
        throw new Error(
          `分取后母样仅剩 ${remainder} g，低于最少保留 ${MIN_PARENT_REMAINDER} g，无法保存`,
        );
      }

      const now = Date.now();
      childId = makeId('sample');
      const child: MeteoriteSample = {
        id: childId,
        sampleNo,
        totalWeight: roundWeight(weight),
        category: parent.category,
        chemicalGroup: parent.chemicalGroup,
        weathering: parent.weathering,
        fallOrFind: parent.fallOrFind,
        storage: input.storage,
        note: input.note?.trim() || undefined,
        parentSampleId: parent.id,
        parentSampleNo: parent.sampleNo,
        splitWeight: roundWeight(weight),
        splitAt: now,
        createdAt: now,
        updatedAt: now,
      };
      await db.samples.add(child);
      await db.samples.update(parent.id, {
        totalWeight: remainder,
        updatedAt: now,
      });

      set((state) => ({
        samples: [
          child,
          ...state.samples.map((s) =>
            s.id === parent.id ? { ...s, totalWeight: remainder, updatedAt: now } : s,
          ),
        ],
      }));
    });
    return childId;
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
