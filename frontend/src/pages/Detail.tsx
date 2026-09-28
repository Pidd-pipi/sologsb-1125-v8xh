import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { Link as RouterLink, useParams } from 'react-router-dom';
import SampleCard from '../components/common/SampleCard';
import FieldGroup from '../components/common/FieldGroup';
import ClassificationBadge from '../components/common/Badge';
import EmptyState from '../components/common/EmptyState';
import { useSampleStore } from '../stores/sampleStore';
import { useToastStore } from '../stores/uiStore';
import {
  ANALYSIS_METHODS,
  ANALYSIS_METHOD_LABELS,
  ANALYSIS_THRESHOLDS,
  type AnalysisMethod,
} from '../types/analysis';
import {
  MINERAL_KEYS,
  MINERAL_LABELS,
  PREPARATIONS,
  PREPARATION_LABELS,
  SECTION_QUALITIES,
  SECTION_QUALITY_LABELS,
  mineralTotal,
  type MineralRatios,
  type PreparationMethod,
  type SectionQuality,
} from '../types/section';
import {
  FALL_OR_FIND_LABELS,
  STORAGE_LABELS,
  STORAGE_LOCATIONS,
  WEATHERING_LABELS,
  isChildSample,
  type StorageLocation,
} from '../types/sample';
import {
  MIN_PARENT_REMAINING_WEIGHT,
  suggestChildSampleNo,
} from '../types/split';
import { FIND_ENVIRONMENT_LABELS, COORDINATE_SOURCE_LABELS } from '../types/find';
import { classifyByAnalysis, evaluateThresholds } from '../utils/classify';
import { formatDate, formatNumber, formatWeight } from '../utils/format';
import { formatCoordinate } from '../utils/geo';

/** `/samples/:id` 样本详情 */
export default function Detail() {
  const { id = '' } = useParams();
  const samples = useSampleStore((s) => s.samples);
  const finds = useSampleStore((s) => s.finds);
  const sections = useSampleStore((s) => s.sections);
  const analysis = useSampleStore((s) => s.analysis);
  const splits = useSampleStore((s) => s.splits);
  const addSection = useSampleStore((s) => s.addSection);
  const addAnalysis = useSampleStore((s) => s.addAnalysis);
  const updateSample = useSampleStore((s) => s.updateSample);
  const splitSample = useSampleStore((s) => s.splitSample);
  const notify = useToastStore((s) => s.notify);

  const sample = useMemo(() => samples.find((s) => s.id === id), [samples, id]);
  const find = useMemo(() => finds.find((f) => f.sampleId === id), [finds, id]);
  const mySections = useMemo(() => sections.filter((s) => s.sampleId === id), [sections, id]);
  const myAnalysis = useMemo(() => analysis.filter((a) => a.sampleId === id), [analysis, id]);

  const isChild = sample ? isChildSample(sample) : false;
  const parent = useMemo(
    () => (sample && sample.parentId ? samples.find((s) => s.id === sample.parentId) : undefined),
    [samples, sample],
  );
  // 母样的分出记录（含已按 childId 查到的子样列表）
  const childSplits = useMemo(
    () => splits.filter((sp) => sp.parentId === id),
    [splits, id],
  );
  // 子样来源凭证；若关系记录缺失（旧库/异常）仍可凭 parentId 追溯母样
  const sourceSplit = useMemo(
    () => splits.find((sp) => sp.childId === id),
    [splits, id],
  );
  const childSamples = useMemo(() => {
    const byId = new Map(samples.map((s) => [s.id, s]));
    return childSplits.flatMap((sp) => {
      const child = byId.get(sp.childId);
      return child ? [{ split: sp, child }] : [];
    });
  }, [childSplits, samples]);

  const [sectionDraft, setSectionDraft] = useState({
    sectionNo: '',
    thickness: 30,
    preparation: 'resin' as PreparationMethod,
    quality: 'unrated' as SectionQuality,
    micrograph: '',
    minerals: { olivine: 40, pyroxene: 25, feldspar: 15, metal: 20 } as MineralRatios,
  });
  const [analysisDraft, setAnalysisDraft] = useState({
    method: 'microprobe' as AnalysisMethod,
    fa: 18,
    fs: 16,
    ni: 0.8,
    kamaciteBandwidth: 0.05,
    testedAt: new Date().toISOString().slice(0, 10),
  });
  const [splitDraft, setSplitDraft] = useState({
    childSampleNo: '',
    splitWeight: 0,
    storage: 'cabinet-a' as StorageLocation,
    note: '',
  });
  const [splitError, setSplitError] = useState<string | null>(null);

  if (!sample) {
    return (
      <Stack spacing={2}>
        <EmptyState
          title="未找到该样本档案"
          description={`样本 id「${id}」不在本地库中，可能已被删除或链接失效。`}
          actionLabel="返回样本总览"
          actionTo="/"
        />
      </Stack>
    );
  }

  const mineralSum = mineralTotal(sectionDraft.minerals);
  const advice = classifyByAnalysis(analysisDraft);
  const hits = evaluateThresholds(analysisDraft);

  // 建议子样编号：母样编号-序号，自动跳过已占用编号
  const suggestedChildNo =
    !isChild && sample
      ? suggestChildSampleNo(sample.sampleNo, childSplits.length)
      : '';
  const splitWeightNum = Number(splitDraft.splitWeight);
  const splitRemaining =
    Number.isFinite(splitWeightNum) && splitWeightNum > 0
      ? Math.round((sample.totalWeight - splitWeightNum) * 1e6) / 1e6
      : null;

  const submitSection = async () => {
    const no = sectionDraft.sectionNo.trim() || `TS-${new Date().getFullYear()}-${mySections.length + 1}`.padEnd(3, '0');
    await addSection({
      sectionNo: no,
      sampleId: sample.id,
      thickness: Number(sectionDraft.thickness),
      preparation: sectionDraft.preparation,
      minerals: sectionDraft.minerals,
      micrographs: sectionDraft.micrograph.trim() ? [sectionDraft.micrograph.trim()] : [],
      quality: sectionDraft.quality,
    });
    notify(`已为 ${sample.sampleNo} 新增切片 ${no}`);
    setSectionDraft((d) => ({ ...d, sectionNo: '', micrograph: '' }));
  };

  const submitAnalysis = async () => {
    await addAnalysis({
      sampleId: sample.id,
      target: 'sample',
      method: analysisDraft.method,
      fa: Number(analysisDraft.fa),
      fs: Number(analysisDraft.fs),
      ni: Number(analysisDraft.ni),
      kamaciteBandwidth: Number(analysisDraft.kamaciteBandwidth),
      testedAt: analysisDraft.testedAt,
    });
    notify(`已为 ${sample.sampleNo} 写入一条检测记录`);
  };

  const submitSplit = async () => {
    const no = splitDraft.childSampleNo.trim();
    const weight = Number(splitDraft.splitWeight);
    if (!no) {
      setSplitError('子样编号不能为空');
      return;
    }
    if (!Number.isFinite(weight) || weight <= 0) {
      setSplitError('分取重量需为大于 0 的数字');
      return;
    }
    if (samples.some((s) => s.sampleNo === no)) {
      setSplitError('该编号已存在，同一编号不能重复');
      return;
    }
    if (weight > sample.totalWeight) {
      setSplitError(`分取重量超过母样剩余重量（剩余 ${sample.totalWeight} g）`);
      return;
    }
    if (sample.totalWeight - weight < MIN_PARENT_REMAINING_WEIGHT) {
      setSplitError(`分取后母样剩余不得少于 ${MIN_PARENT_REMAINING_WEIGHT} g`);
      return;
    }
    setSplitError(null);
    const result = await splitSample({
      parentId: sample.id,
      childSampleNo: no,
      splitWeight: weight,
      storage: splitDraft.storage,
      note: splitDraft.note,
    });
    if (!result.ok) {
      setSplitError(result.error);
      return;
    }
    notify(`已从 ${sample.sampleNo} 分出子样 ${no}（${formatWeight(weight)}）`);
    setSplitDraft({ childSampleNo: '', splitWeight: 0, storage: 'cabinet-a', note: '' });
  };

  return (
    <Stack spacing={2.5}>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Button component={RouterLink} to="/" startIcon={<ArrowBackIcon />} variant="text">
          返回总览
        </Button>
        <Typography variant="h4">样本详情</Typography>
        <Chip
          size="small"
          color={isChild ? 'secondary' : 'default'}
          variant={isChild ? 'filled' : 'outlined'}
          label={isChild ? '分出子样' : '母样'}
        />
      </Stack>

      <Grid container spacing={2.5}>
        <Grid item xs={12} md={4}>
          <SampleCard
            sample={sample}
            find={find}
            sectionCount={mySections.length}
            analysisCount={myAnalysis.length}
            parentSampleNo={parent?.sampleNo}
          />
        </Grid>

        <Grid item xs={12} md={8}>
          <Paper variant="outlined" sx={{ p: 2.5, height: '100%' }}>
            <Stack spacing={1.5}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="h6">基本信息</Typography>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => {
                    void updateSample(sample.id, { storage: sample.storage === 'loan-out' ? 'cabinet-a' : 'loan-out' });
                    notify('已切换存放状态');
                  }}
                >
                  切换存放状态
                </Button>
              </Stack>
              <ClassificationBadge
                category={sample.category}
                group={sample.chemicalGroup}
                size="medium"
              />
              <Grid container spacing={1.5}>
                <Grid item xs={6} sm={4}>
                  <Typography variant="caption" color="text.secondary">
                    编号
                  </Typography>
                  <Typography variant="body1">{sample.sampleNo}</Typography>
                </Grid>
                <Grid item xs={6} sm={4}>
                  <Typography variant="caption" color="text.secondary">
                    {isChild ? '子样重量' : '剩余重量'}
                  </Typography>
                  <Typography variant="body1">{formatWeight(sample.totalWeight)}</Typography>
                </Grid>
                <Grid item xs={6} sm={4}>
                  <Typography variant="caption" color="text.secondary">
                    风化等级
                  </Typography>
                  <Typography variant="body1">{WEATHERING_LABELS[sample.weathering]}</Typography>
                </Grid>
                <Grid item xs={6} sm={4}>
                  <Typography variant="caption" color="text.secondary">
                    发现 / 坠落
                  </Typography>
                  <Typography variant="body1">{FALL_OR_FIND_LABELS[sample.fallOrFind]}</Typography>
                </Grid>
                <Grid item xs={6} sm={4}>
                  <Typography variant="caption" color="text.secondary">
                    存放位置
                  </Typography>
                  <Typography variant="body1">{STORAGE_LABELS[sample.storage]}</Typography>
                </Grid>
                <Grid item xs={6} sm={4}>
                  <Typography variant="caption" color="text.secondary">
                    登记 / 更新
                  </Typography>
                  <Typography variant="body1">
                    {formatDate(sample.createdAt)} / {formatDate(sample.updatedAt)}
                  </Typography>
                </Grid>
              </Grid>
              {sample.note ? (
                <Typography variant="body2" color="text.secondary">
                  备注：{sample.note}
                </Typography>
              ) : null}
              <Divider />
              {isChild ? (
                <>
                  <Typography variant="h6">来源追溯</Typography>
                  {parent ? (
                    <Grid container spacing={1.5}>
                      <Grid item xs={12} sm={6}>
                        <Typography variant="caption" color="text.secondary">
                          来源母样
                        </Typography>
                        <Typography
                          component={RouterLink}
                          to={`/samples/${parent.id}`}
                          variant="body1"
                          sx={{ color: 'primary.main', textDecoration: 'none', fontWeight: 700 }}
                        >
                          {parent.sampleNo} ↗
                        </Typography>
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <Typography variant="caption" color="text.secondary">
                          分取重量
                        </Typography>
                        <Typography variant="body2">
                          {sourceSplit ? formatWeight(sourceSplit.splitWeight) : formatWeight(sample.totalWeight)}
                        </Typography>
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <Typography variant="caption" color="text.secondary">
                          分出日期
                        </Typography>
                        <Typography variant="body2">
                          {sourceSplit ? formatDate(sourceSplit.createdAt) : '—'}
                        </Typography>
                      </Grid>
                      <Grid item xs={6} sm={6}>
                        <Typography variant="caption" color="text.secondary">
                          母样当前剩余
                        </Typography>
                        <Typography variant="body2">{formatWeight(parent.totalWeight)}</Typography>
                      </Grid>
                      <Grid item xs={6} sm={6}>
                        <Typography variant="caption" color="text.secondary">
                          母样存放位置
                        </Typography>
                        <Typography variant="body2">{STORAGE_LABELS[parent.storage]}</Typography>
                      </Grid>
                      <Grid item xs={12}>
                        <Typography variant="caption" color="text.secondary">
                          子样的分类、化学群继承自母样；发现地与切片信息请在母样档案中查阅。
                        </Typography>
                      </Grid>
                    </Grid>
                  ) : (
                    <Alert severity="warning">
                      来源母样已被删除，该子样现为独立样本；其分类信息仍可正常查阅。
                    </Alert>
                  )}
                </>
              ) : (
                <>
                  <Typography variant="h6">发现地摘要</Typography>
                  {find ? (
                    <Grid container spacing={1.5}>
                      <Grid item xs={6} sm={4}>
                        <Typography variant="caption" color="text.secondary">
                          地名
                        </Typography>
                        <Typography variant="body2">{find.placeName}</Typography>
                      </Grid>
                      <Grid item xs={6} sm={4}>
                        <Typography variant="caption" color="text.secondary">
                          国家 / 地区
                        </Typography>
                        <Typography variant="body2">{find.region}</Typography>
                      </Grid>
                      <Grid item xs={6} sm={4}>
                        <Typography variant="caption" color="text.secondary">
                          坐标
                        </Typography>
                        <Typography variant="body2">
                          {formatCoordinate(find.longitude, find.latitude)}
                        </Typography>
                      </Grid>
                      <Grid item xs={6} sm={4}>
                        <Typography variant="caption" color="text.secondary">
                          坐标来源
                        </Typography>
                        <Typography variant="body2">
                          {COORDINATE_SOURCE_LABELS[find.coordinateSource]}
                        </Typography>
                      </Grid>
                      <Grid item xs={6} sm={4}>
                        <Typography variant="caption" color="text.secondary">
                          发现环境
                        </Typography>
                        <Typography variant="body2">
                          {FIND_ENVIRONMENT_LABELS[find.environment]}
                        </Typography>
                      </Grid>
                      <Grid item xs={6} sm={4}>
                        <Typography variant="caption" color="text.secondary">
                          发现者
                        </Typography>
                        <Typography variant="body2">{find.finder}</Typography>
                      </Grid>
                    </Grid>
                  ) : (
                    <Alert severity="warning">
                      该样本尚未登记发现地坐标，可返回 <RouterLink to="/samples/new">样本登记</RouterLink> 补录。
                    </Alert>
                  )}
                </>
              )}
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      {!isChild ? (
        <Grid container spacing={2.5}>
          <Grid item xs={12} md={5}>
            <Paper variant="outlined" sx={{ p: 2.5, height: '100%' }}>
              <Typography variant="h6" sx={{ mb: 1.5 }}>
                分出子样（{childSamples.length}）
              </Typography>
              {childSamples.length === 0 ? (
                <Alert severity="info">
                  尚未分出子样。保存分样后，母样剩余重量自动扣减，并在此记录分出关系；子样可独立盘点与借样。
                </Alert>
              ) : (
                <Stack spacing={1.25}>
                  {childSamples.map(({ split, child }) => (
                    <Box
                      key={split.id}
                      sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5 }}
                    >
                      <Stack direction="row" justifyContent="space-between" flexWrap="wrap" gap={1}>
                        <Typography
                          component={RouterLink}
                          to={`/samples/${child.id}`}
                          variant="subtitle1"
                          fontWeight={700}
                          sx={{ color: 'primary.main', textDecoration: 'none' }}
                        >
                          {child.sampleNo} ↗
                        </Typography>
                        <Chip size="small" label={`分出 ${formatWeight(split.splitWeight)}`} color="secondary" />
                      </Stack>
                      <Typography variant="body2" color="text.secondary">
                        现存放：{STORAGE_LABELS[child.storage]} · 分出日期 {formatDate(split.createdAt)}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              )}
            </Paper>
          </Grid>

          <Grid item xs={12} md={7}>
            <Paper variant="outlined" sx={{ p: 2.5, height: '100%' }}>
              <Stack spacing={1.5}>
                <Typography variant="h6">分出子样</Typography>
                <Typography variant="caption" color="text.secondary">
                  填写子样编号、分取重量与存放位置。保存后母样剩余重量扣减；同一编号不可重复，分取重量不能超过剩余重量，且分后母样至少保留 {MIN_PARENT_REMAINING_WEIGHT} g。
                </Typography>
                {splitError ? <Alert severity="error">{splitError}</Alert> : null}
                <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                  <TextField
                    id="split-child-no"
                    size="small"
                    label="子样编号"
                    required
                    value={splitDraft.childSampleNo}
                    onChange={(e) => setSplitDraft((d) => ({ ...d, childSampleNo: e.target.value }))}
                    sx={{ width: 220 }}
                  />
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => setSplitDraft((d) => ({ ...d, childSampleNo: suggestedChildNo }))}
                    sx={{ alignSelf: 'center' }}
                  >
                    建议编号 {suggestedChildNo}
                  </Button>
                  <TextField
                    id="split-weight"
                    size="small"
                    type="number"
                    label="分取重量 g"
                    required
                    inputProps={{ min: 0, step: '0.01' }}
                    value={splitDraft.splitWeight || ''}
                    onChange={(e) =>
                      setSplitDraft((d) => ({ ...d, splitWeight: Number(e.target.value) }))
                    }
                    sx={{ width: 150 }}
                  />
                  <FormControl size="small" sx={{ minWidth: 180 }}>
                    <InputLabel id="split-storage-label">存放位置</InputLabel>
                    <Select
                      labelId="split-storage-label"
                      label="存放位置"
                      value={splitDraft.storage}
                      onChange={(e) =>
                        setSplitDraft((d) => ({ ...d, storage: e.target.value as StorageLocation }))
                      }
                    >
                      {STORAGE_LOCATIONS.map((loc) => (
                        <MenuItem key={loc} value={loc}>
                          {STORAGE_LABELS[loc]}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Stack>
                <TextField
                  id="split-note"
                  size="small"
                  label="子样备注（可选，如用途/借样去向）"
                  value={splitDraft.note}
                  onChange={(e) => setSplitDraft((d) => ({ ...d, note: e.target.value }))}
                  multiline
                  minRows={1}
                />
                {splitRemaining !== null ? (
                  <Typography
                    variant="caption"
                    color={splitRemaining < MIN_PARENT_REMAINING_WEIGHT ? 'error.main' : 'success.main'}
                  >
                    {splitRemaining < MIN_PARENT_REMAINING_WEIGHT
                      ? `分取后母样仅剩 ${splitRemaining} g，低于 ${MIN_PARENT_REMAINING_WEIGHT} g 下限，无法保存`
                      : `分取后母样剩余 ${splitRemaining} g（当前剩余 ${sample.totalWeight} g）`}
                  </Typography>
                ) : (
                  <Typography variant="caption" color="text.secondary">
                    母样当前剩余 {formatWeight(sample.totalWeight)}
                  </Typography>
                )}
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => void submitSplit()}
                  id="add-split"
                  sx={{ alignSelf: 'flex-start' }}
                >
                  保存并分出子样
                </Button>
              </Stack>
            </Paper>
          </Grid>
        </Grid>
      ) : null}

      <Grid container spacing={2.5}>
        <Grid item xs={12} md={7}>
          <Paper variant="outlined" sx={{ p: 2.5 }}>
            <Typography variant="h6" sx={{ mb: 1.5 }}>
              切片与制样（{mySections.length}）
            </Typography>
            {mySections.length === 0 ? (
              <Alert severity="info">暂无切片记录，可在下方就地新增。</Alert>
            ) : (
              <Stack spacing={1.25}>
                {mySections.map((s) => (
                  <Box
                    key={s.id}
                    sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5 }}
                  >
                    <Stack direction="row" justifyContent="space-between" flexWrap="wrap" gap={1}>
                      <Typography variant="subtitle1" fontWeight={700}>
                        {s.sectionNo}
                      </Typography>
                      <Stack direction="row" spacing={0.75}>
                        <Chip size="small" label={`厚度 ${s.thickness} μm`} />
                        <Chip size="small" variant="outlined" label={PREPARATION_LABELS[s.preparation]} />
                        <Chip size="small" color="secondary" label={SECTION_QUALITY_LABELS[s.quality]} />
                      </Stack>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      矿物占比：{MINERAL_KEYS.map((k) => `${MINERAL_LABELS[k]} ${s.minerals[k]}%`).join(' · ')}
                      （合计 {mineralTotal(s.minerals)}%）
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      显微照片：{s.micrographs.length ? s.micrographs.join('、') : '未上传'}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            )}

            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
              就地新增切片
            </Typography>
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                <TextField
                  id="section-no"
                  size="small"
                  label="切片编号"
                  value={sectionDraft.sectionNo}
                  onChange={(e) => setSectionDraft((d) => ({ ...d, sectionNo: e.target.value }))}
                  sx={{ width: 180 }}
                />
                <TextField
                  id="section-thickness"
                  size="small"
                  type="number"
                  label="厚度 μm"
                  value={sectionDraft.thickness}
                  onChange={(e) => setSectionDraft((d) => ({ ...d, thickness: Number(e.target.value) }))}
                  sx={{ width: 140 }}
                />
                <FormControl size="small" sx={{ minWidth: 150 }}>
                  <InputLabel id="prep-label">制样方式</InputLabel>
                  <Select
                    labelId="prep-label"
                    label="制样方式"
                    value={sectionDraft.preparation}
                    onChange={(e) =>
                      setSectionDraft((d) => ({ ...d, preparation: e.target.value as PreparationMethod }))
                    }
                  >
                    {PREPARATIONS.map((p) => (
                      <MenuItem key={p} value={p}>
                        {PREPARATION_LABELS[p]}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 170 }}>
                  <InputLabel id="quality-label">质量标注</InputLabel>
                  <Select
                    labelId="quality-label"
                    label="质量标注"
                    value={sectionDraft.quality}
                    onChange={(e) =>
                      setSectionDraft((d) => ({ ...d, quality: e.target.value as SectionQuality }))
                    }
                  >
                    {SECTION_QUALITIES.map((q) => (
                      <MenuItem key={q} value={q}>
                        {SECTION_QUALITY_LABELS[q]}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  id="section-micrograph"
                  size="small"
                  label="显微照片文件名"
                  value={sectionDraft.micrograph}
                  onChange={(e) => setSectionDraft((d) => ({ ...d, micrograph: e.target.value }))}
                  sx={{ width: 220 }}
                />
              </Stack>

              <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                {MINERAL_KEYS.map((k) => (
                  <FieldGroup
                    key={k}
                    title={`${MINERAL_LABELS[k]}占比`}
                    unit="%"
                    min={0}
                    max={100}
                    value={sectionDraft.minerals[k]}
                    onChange={(v) =>
                      setSectionDraft((d) => ({ ...d, minerals: { ...d.minerals, [k]: v } }))
                    }
                    inputId={`mineral-${k}`}
                    label={MINERAL_LABELS[k]}
                  />
                ))}
              </Stack>
              <Typography variant="caption" color={mineralSum === 100 ? 'success.main' : 'warning.main'}>
                矿物占比合计 {mineralSum}%（建议合计 100%）
              </Typography>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={submitSection}
                id="add-section"
                sx={{ alignSelf: 'flex-start' }}
              >
                新增切片
              </Button>
            </Stack>
          </Paper>
        </Grid>

        <Grid item xs={12} md={5}>
          <Paper variant="outlined" sx={{ p: 2.5 }}>
            <Typography variant="h6" sx={{ mb: 1.5 }}>
              分析检测记录（{myAnalysis.length}）
            </Typography>
            {myAnalysis.length === 0 ? (
              <Alert severity="info">暂无检测记录。</Alert>
            ) : (
              <Stack spacing={1.25} sx={{ mb: 2 }}>
                {myAnalysis.map((a) => {
                  const a2 = classifyByAnalysis(a);
                  return (
                    <Box
                      key={a.id}
                      sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5 }}
                    >
                      <Stack direction="row" justifyContent="space-between" flexWrap="wrap" gap={1}>
                        <Typography variant="subtitle2">
                          {ANALYSIS_METHOD_LABELS[a.method]} · {a.testedAt}
                        </Typography>
                        <ClassificationBadge category={a2.category} showGroup={false} />
                      </Stack>
                      <Typography variant="body2" color="text.secondary">
                        Fa {formatNumber(a.fa, 2, ' mol%')} · Fs {formatNumber(a.fs, 2, ' mol%')} · Ni{' '}
                        {formatNumber(a.ni, 2, ' wt%')} · 带宽 {formatNumber(a.kamaciteBandwidth, 3, ' mm')}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {a2.summary}
                      </Typography>
                    </Box>
                  );
                })}
              </Stack>
            )}

            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
              就地录入检测数值
            </Typography>
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                <FormControl size="small" sx={{ minWidth: 150 }}>
                  <InputLabel id="method-label">检测方法</InputLabel>
                  <Select
                    labelId="method-label"
                    label="检测方法"
                    value={analysisDraft.method}
                    onChange={(e) =>
                      setAnalysisDraft((d) => ({ ...d, method: e.target.value as AnalysisMethod }))
                    }
                  >
                    {ANALYSIS_METHODS.map((m) => (
                      <MenuItem key={m} value={m}>
                        {ANALYSIS_METHOD_LABELS[m]}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  id="detail-tested-at"
                  size="small"
                  type="date"
                  label="检测日期"
                  InputLabelProps={{ shrink: true }}
                  value={analysisDraft.testedAt}
                  onChange={(e) => setAnalysisDraft((d) => ({ ...d, testedAt: e.target.value }))}
                  sx={{ width: 180 }}
                />
              </Stack>
              <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                <FieldGroup
                  title="橄榄石 Fa"
                  unit="mol%"
                  min={0}
                  max={30}
                  value={analysisDraft.fa}
                  onChange={(v) => setAnalysisDraft((d) => ({ ...d, fa: v }))}
                  inputId="detail-fa"
                  label="Fa"
                />
                <FieldGroup
                  title="辉石 Fs"
                  unit="mol%"
                  min={0}
                  max={30}
                  value={analysisDraft.fs}
                  onChange={(v) => setAnalysisDraft((d) => ({ ...d, fs: v }))}
                  inputId="detail-fs"
                  label="Fs"
                />
                <FieldGroup
                  title="Ni 含量"
                  unit="wt%"
                  min={0}
                  max={20}
                  value={analysisDraft.ni}
                  onChange={(v) => setAnalysisDraft((d) => ({ ...d, ni: v }))}
                  inputId="detail-ni"
                  label="Ni"
                />
                <FieldGroup
                  title="铁纹石带宽"
                  unit="mm"
                  min={0}
                  max={2}
                  value={analysisDraft.kamaciteBandwidth}
                  onChange={(v) => setAnalysisDraft((d) => ({ ...d, kamaciteBandwidth: v }))}
                  inputId="detail-band"
                  label="带宽"
                />
              </Stack>
              <Alert severity={hits.every((h) => h.inRange) ? 'success' : 'warning'}>
                分类建议：{advice.summary}
                <br />
                阈值命中：{hits.filter((h) => h.inRange).length}/{hits.length} 项落在常规区间
                <br />
                命中说明：{advice.hits.join('；')}
              </Alert>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={submitAnalysis}
                id="add-analysis"
                sx={{ alignSelf: 'flex-start' }}
              >
                写入检测记录
              </Button>
              <Typography variant="caption" color="text.secondary">
                阈值参考：
                {ANALYSIS_THRESHOLDS.map((t) => `${t.label} ${t.min}~${t.max}${t.unit}`).join(' · ')}
              </Typography>
            </Stack>
          </Paper>
        </Grid>
      </Grid>
    </Stack>
  );
}
