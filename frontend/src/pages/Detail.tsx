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
import CallSplitIcon from '@mui/icons-material/CallSplit';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
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
  MIN_PARENT_REMAINDER,
  STORAGE_LABELS,
  STORAGE_LOCATIONS,
  WEATHERING_LABELS,
  roundWeight,
  type StorageLocation,
} from '../types/sample';
import { FIND_ENVIRONMENT_LABELS, COORDINATE_SOURCE_LABELS } from '../types/find';
import { classifyByAnalysis, evaluateThresholds } from '../utils/classify';
import { formatDate, formatNumber, formatWeight } from '../utils/format';
import { formatCoordinate } from '../utils/geo';

/** `/samples/:id` 样本详情 */
export default function Detail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const samples = useSampleStore((s) => s.samples);
  const finds = useSampleStore((s) => s.finds);
  const sections = useSampleStore((s) => s.sections);
  const analysis = useSampleStore((s) => s.analysis);
  const addSection = useSampleStore((s) => s.addSection);
  const addAnalysis = useSampleStore((s) => s.addAnalysis);
  const updateSample = useSampleStore((s) => s.updateSample);
  const splitChildSample = useSampleStore((s) => s.splitChildSample);
  const notify = useToastStore((s) => s.notify);

  const sample = useMemo(() => samples.find((s) => s.id === id), [samples, id]);
  const find = useMemo(() => finds.find((f) => f.sampleId === id), [finds, id]);
  const mySections = useMemo(() => sections.filter((s) => s.sampleId === id), [sections, id]);
  const myAnalysis = useMemo(() => analysis.filter((a) => a.sampleId === id), [analysis, id]);
  // 母样视角：直接分出的子样（按分出时间升序，构成可追溯台账）
  const childSamples = useMemo(
    () =>
      samples
        .filter((s) => s.parentSampleId === id)
        .sort((a, b) => (a.splitAt ?? a.createdAt) - (b.splitAt ?? b.createdAt)),
    [samples, id],
  );
  // 子样视角：来源母样（可能已不在本地库，此时仅能凭 parentSampleNo 追溯）
  const parentSample = useMemo(
    () => (sample?.parentSampleId ? samples.find((s) => s.id === sample.parentSampleId) : undefined),
    [samples, sample],
  );
  const childTotalWeight = useMemo(
    () => roundWeight(childSamples.reduce((n, c) => n + (c.splitWeight ?? c.totalWeight), 0)),
    [childSamples],
  );

  const [splitOpen, setSplitOpen] = useState(false);
  const [splitForm, setSplitForm] = useState({
    sampleNo: '',
    splitWeight: '' as number | '',
    storage: 'cabinet-a' as StorageLocation,
    note: '',
  });
  const [splitError, setSplitError] = useState<string | null>(null);
  const [savingSplit, setSavingSplit] = useState(false);

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

  const openSplitForm = () => {
    setSplitForm((f) => ({
      ...f,
      // 默认建议编号：母样编号 + -A/-B…，仍可手工修改，唯一性由保存时校验
      sampleNo: `${sample.sampleNo}-${String.fromCharCode(65 + childSamples.length)}`,
      splitWeight: '',
      note: '',
    }));
    setSplitError(null);
    setSplitOpen(true);
  };

  // 分取重量的即时预估，用于在表单里提示“分取后剩余”；最终判定仍以 store 事务为准
  const splitWeightNum = Number(splitForm.splitWeight);
  const splitPreview =
    splitOpen && splitForm.splitWeight !== '' && Number.isFinite(splitWeightNum)
      ? roundWeight(sample.totalWeight - splitWeightNum)
      : null;
  const splitPreviewError =
    splitPreview === null
      ? null
      : splitPreview < 0
        ? `超过母样剩余重量（${sample.totalWeight} g）`
        : splitPreview < MIN_PARENT_REMAINDER
          ? `分取后母样仅剩 ${splitPreview} g，至少保留 ${MIN_PARENT_REMAINDER} g`
          : null;

  const submitSplit = async () => {
    setSplitError(null);
    if (!splitForm.sampleNo.trim()) {
      setSplitError('子样编号不能为空');
      return;
    }
    if (
      splitForm.splitWeight === '' ||
      !Number.isFinite(splitWeightNum) ||
      splitWeightNum <= 0
    ) {
      setSplitError('分取重量需大于 0 g');
      return;
    }
    setSavingSplit(true);
    try {
      const childId = await splitChildSample({
        parentId: sample.id,
        sampleNo: splitForm.sampleNo,
        splitWeight: splitWeightNum,
        storage: splitForm.storage,
        note: splitForm.note,
      });
      notify(`已分出子样 ${splitForm.sampleNo.trim()}，母样剩余重量已扣减`);
      setSplitOpen(false);
      navigate(childId);
    } catch (err) {
      // 编号重复 / 超重 / 留底不足：事务已整体回滚，母样重量不变
      setSplitError(err instanceof Error ? err.message : '分出失败，请重试');
    } finally {
      setSavingSplit(false);
    }
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
          color={sample.parentSampleId ? 'secondary' : 'primary'}
          label={sample.parentSampleId ? '子样（研究分样）' : '母样'}
        />
      </Stack>

      <Grid container spacing={2.5}>
        <Grid item xs={12} md={4}>
          <SampleCard
            sample={sample}
            find={find}
            sectionCount={mySections.length}
            analysisCount={myAnalysis.length}
            childCount={childSamples.length}
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
                    {sample.parentSampleId ? '分取重量' : '剩余重量'}
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
                {sample.parentSampleId ? (
                  <Grid item xs={6} sm={4}>
                    <Typography variant="caption" color="text.secondary">
                      分出时间
                    </Typography>
                    <Typography variant="body1">{formatDate(sample.splitAt ?? sample.createdAt)}</Typography>
                  </Grid>
                ) : childSamples.length ? (
                  <Grid item xs={6} sm={4}>
                    <Typography variant="caption" color="text.secondary">
                      已分出
                    </Typography>
                    <Typography variant="body1">
                      {childSamples.length} 份子样 · 累计 {formatWeight(childTotalWeight)}
                    </Typography>
                  </Grid>
                ) : null}
              </Grid>
              {sample.note ? (
                <Typography variant="body2" color="text.secondary">
                  备注：{sample.note}
                </Typography>
              ) : null}
              <Divider />
              {sample.parentSampleId ? (
                <>
                  <Typography variant="h6">来源追溯</Typography>
                  <Box
                    sx={{
                      border: '1px solid',
                      borderColor: 'secondary.light',
                      borderRadius: 2,
                      p: 1.5,
                      bgcolor: 'rgba(141,110,99,0.06)',
                    }}
                  >
                    <Stack spacing={1}>
                      <Typography variant="body2">
                        本子样于 {formatDate(sample.splitAt ?? sample.createdAt)} 从母样分出，分取重量{' '}
                        <strong>{formatWeight(sample.splitWeight ?? sample.totalWeight)}</strong>。
                      </Typography>
                      {parentSample ? (
                        <Typography
                          component={RouterLink}
                          to={`/samples/${parentSample.id}`}
                          variant="subtitle2"
                          sx={{ color: 'primary.main', textDecoration: 'none' }}
                        >
                          来源母样：{sample.parentSampleNo}（当前剩余 {formatWeight(parentSample.totalWeight)}）↗
                        </Typography>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          来源母样编号：{sample.parentSampleNo}
                          <br />
                          母样档案已不在本地库，以上为分出时留存的编号快照。
                        </Typography>
                      )}
                      {parentSample ? (
                        <Typography variant="caption" color="text.secondary">
                          分类、化学群与发现地信息均继承自母样。
                        </Typography>
                      ) : null}
                    </Stack>
                  </Box>
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

      {!sample.parentSampleId ? (
        <Paper variant="outlined" sx={{ p: 2.5 }}>
          <Stack spacing={1.5}>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              flexWrap="wrap"
              gap={1}
            >
              <Typography variant="h6">分出子样（{childSamples.length}）</Typography>
              <Button
                size="small"
                variant="contained"
                color="secondary"
                startIcon={<CallSplitIcon />}
                onClick={openSplitForm}
                id="open-split"
              >
                分出子样
              </Button>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              研究分样在此建档：保存后按分取重量扣减母样剩余重量，并自动记录分出关系。母样至少保留{' '}
              {MIN_PARENT_REMAINDER} g，编号不可与现有样本重复。
            </Typography>

            {childSamples.length === 0 ? (
              <Alert severity="info">尚未分出子样，母样重量保持 {formatWeight(sample.totalWeight)}。</Alert>
            ) : (
              <Stack spacing={1}>
                {childSamples.map((c) => (
                  <Box
                    key={c.id}
                    sx={{
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 2,
                      p: 1.5,
                    }}
                  >
                    <Stack direction="row" justifyContent="space-between" flexWrap="wrap" gap={1}>
                      <Typography
                        component={RouterLink}
                        to={`/samples/${c.id}`}
                        variant="subtitle1"
                        fontWeight={700}
                        sx={{ color: 'primary.main', textDecoration: 'none' }}
                      >
                        {c.sampleNo} ↗
                      </Typography>
                      <Chip
                        size="small"
                        label={`分出 ${formatWeight(c.splitWeight ?? c.totalWeight)} · ${formatDate(c.splitAt ?? c.createdAt)}`}
                      />
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      存放位置：{STORAGE_LABELS[c.storage]}
                      {c.note ? ` · ${c.note}` : ''}
                    </Typography>
                  </Box>
                ))}
                <Typography variant="caption" color="text.secondary">
                  累计分出 {formatWeight(childTotalWeight)}，母样剩余 {formatWeight(sample.totalWeight)}
                  （原始入藏合计 {formatWeight(roundWeight(childTotalWeight + sample.totalWeight))}，供盘点对账）
                </Typography>
              </Stack>
            )}

            {splitOpen ? (
              <>
                <Divider />
                <Typography variant="subtitle1" fontWeight={700}>填写分出信息</Typography>
                {splitError ? <Alert severity="error">{splitError}</Alert> : null}
                <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                  <TextField
                    id="split-sample-no"
                    size="small"
                    label="子样编号"
                    value={splitForm.sampleNo}
                    onChange={(e) => setSplitForm((f) => ({ ...f, sampleNo: e.target.value }))}
                    sx={{ width: 220 }}
                    required
                  />
                  <TextField
                    id="split-weight"
                    size="small"
                    type="number"
                    label="分取重量 g"
                    value={splitForm.splitWeight}
                    onChange={(e) =>
                      setSplitForm((f) => ({
                        ...f,
                        splitWeight: e.target.value === '' ? '' : Number(e.target.value),
                      }))
                    }
                    sx={{ width: 150 }}
                    inputProps={{ min: 0.1, step: 0.1 }}
                    required
                  />
                  <FormControl size="small" sx={{ minWidth: 180 }}>
                    <InputLabel id="split-storage-label">存放位置</InputLabel>
                    <Select
                      labelId="split-storage-label"
                      label="存放位置"
                      value={splitForm.storage}
                      onChange={(e) =>
                        setSplitForm((f) => ({ ...f, storage: e.target.value as StorageLocation }))
                      }
                    >
                      {STORAGE_LOCATIONS.map((loc) => (
                        <MenuItem key={loc} value={loc}>
                          {STORAGE_LABELS[loc]}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <TextField
                    id="split-note"
                    size="small"
                    label="备注（可选，如用途）"
                    value={splitForm.note}
                    onChange={(e) => setSplitForm((f) => ({ ...f, note: e.target.value }))}
                    sx={{ width: 220 }}
                  />
                </Stack>
                {splitPreview !== null ? (
                  <Typography
                    variant="caption"
                    color={splitPreviewError ? 'error.main' : 'success.main'}
                  >
                    {splitPreviewError
                      ? splitPreviewError
                      : `分取后母样剩余 ${splitPreview} g，可保存。`}
                  </Typography>
                ) : null}
                <Stack direction="row" spacing={1.5}>
                  <Button
                    variant="contained"
                    color="secondary"
                    startIcon={<CallSplitIcon />}
                    onClick={() => void submitSplit()}
                    disabled={savingSplit || Boolean(splitPreviewError)}
                    id="save-split"
                  >
                    {savingSplit ? '保存中…' : '确认分出并扣减'}
                  </Button>
                  <Button
                    variant="text"
                    onClick={() => {
                      setSplitOpen(false);
                      setSplitError(null);
                    }}
                    disabled={savingSplit}
                  >
                    取消
                  </Button>
                </Stack>
              </>
            ) : null}
          </Stack>
        </Paper>
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
