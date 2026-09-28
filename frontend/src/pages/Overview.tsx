import { useMemo } from 'react';
import {
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { Link as RouterLink } from 'react-router-dom';
import SampleCard from '../components/common/SampleCard';
import EmptyState from '../components/common/EmptyState';
import { useSampleFilter } from '../hooks/useSampleFilter';
import { useSampleStore } from '../stores/sampleStore';
import { useUiStore } from '../stores/uiStore';
import {
  CATEGORY_LABELS,
  CHEMICAL_GROUP_LABELS,
  SAMPLE_CATEGORIES,
  CHEMICAL_GROUPS,
} from '../types/sample';
import { formatWeight } from '../utils/format';

/** `/` 样本总览 */
export default function Overview() {
  const { results, parentResults, childResults, total, parentTotal, childTotal, activeCount } =
    useSampleFilter();
  const samples = useSampleStore((s) => s.samples);
  const finds = useSampleStore((s) => s.finds);
  const sections = useSampleStore((s) => s.sections);
  const analysis = useSampleStore((s) => s.analysis);

  const ui = useUiStore();

  const sampleMap = useMemo(() => new Map(samples.map((s) => [s.id, s])), [samples]);
  const findBySample = useMemo(() => new Map(finds.map((f) => [f.sampleId, f])), [finds]);
  const sectionCount = useMemo(() => {
    const m = new Map<string, number>();
    sections.forEach((s) => m.set(s.sampleId, (m.get(s.sampleId) ?? 0) + 1));
    return m;
  }, [sections]);
  const analysisCount = useMemo(() => {
    const m = new Map<string, number>();
    analysis.forEach((a) => m.set(a.sampleId, (m.get(a.sampleId) ?? 0) + 1));
    return m;
  }, [analysis]);

  const totalWeight = results.reduce((n, s) => n + s.totalWeight, 0);

  return (
    <Stack spacing={2.5}>
      <Stack direction="row" alignItems="flex-end" justifyContent="space-between" flexWrap="wrap" gap={2}>
        <Box>
          <Typography variant="h4">样本总览</Typography>
          <Typography variant="body2" color="text.secondary">
            母样 {parentTotal} 份 · 子样 {childTotal} 份，共 {total} 份；当前筛选命中{' '}
            {results.length} 份，合计重量（母样剩余 + 子样）{formatWeight(totalWeight)}
          </Typography>
        </Box>
        <Button component={RouterLink} to="/samples/new" variant="contained" startIcon={<AddIcon />}>
          登记新样本
        </Button>
      </Stack>

      <Box
        sx={{
          p: 2,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2.5,
          bgcolor: 'background.paper',
        }}
      >
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography variant="subtitle2" sx={{ width: 72 }}>
              分类
            </Typography>
            {SAMPLE_CATEGORIES.map((c) => {
              const active = ui.categories.includes(c);
              return (
                <Chip
                  key={c}
                  label={CATEGORY_LABELS[c]}
                  color={active ? 'primary' : 'default'}
                  variant={active ? 'filled' : 'outlined'}
                  onClick={() =>
                    ui.setCategories(
                      active ? ui.categories.filter((x) => x !== c) : [...ui.categories, c],
                    )
                  }
                />
              );
            })}
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography variant="subtitle2" sx={{ width: 72 }}>
              化学群
            </Typography>
            {CHEMICAL_GROUPS.map((g) => {
              const active = ui.groups.includes(g);
              return (
                <Chip
                  key={g}
                  label={CHEMICAL_GROUP_LABELS[g]}
                  color={active ? 'secondary' : 'default'}
                  variant={active ? 'filled' : 'outlined'}
                  onClick={() =>
                    ui.setGroups(active ? ui.groups.filter((x) => x !== g) : [...ui.groups, g])
                  }
                />
              );
            })}
          </Stack>

          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography variant="subtitle2" sx={{ width: 72 }}>
              重量区间
            </Typography>
            <TextField
              id="filter-min-weight"
              size="small"
              type="number"
              label="最小 g"
              value={ui.minWeight ?? ''}
              onChange={(e) =>
                ui.setWeightRange(e.target.value === '' ? null : Number(e.target.value), ui.maxWeight)
              }
              sx={{ width: 130 }}
            />
            <Typography variant="body2">~</Typography>
            <TextField
              id="filter-max-weight"
              size="small"
              type="number"
              label="最大 g"
              value={ui.maxWeight ?? ''}
              onChange={(e) =>
                ui.setWeightRange(ui.minWeight, e.target.value === '' ? null : Number(e.target.value))
              }
              sx={{ width: 130 }}
            />
            <TextField
              id="filter-keyword"
              size="small"
              label="编号 / 备注关键词"
              value={ui.keyword}
              onChange={(e) => ui.setKeyword(e.target.value)}
              sx={{ width: 220 }}
            />
            <FormControl size="small" sx={{ width: 160 }}>
              <InputLabel id="sort-label">排序</InputLabel>
              <Select
                labelId="sort-label"
                label="排序"
                value={ui.sort}
                onChange={(e) => ui.setSort(e.target.value as typeof ui.sort)}
              >
                <MenuItem value="createdAt">按登记时间</MenuItem>
                <MenuItem value="totalWeight">按总重量</MenuItem>
                <MenuItem value="sampleNo">按样本编号</MenuItem>
              </Select>
            </FormControl>
            <Button variant="text" onClick={ui.reset} disabled={activeCount === 0}>
              清空筛选
            </Button>
            <Chip size="small" label={`生效条件 ${activeCount}`} variant="outlined" />
          </Stack>
        </Stack>
      </Box>

      {results.length === 0 ? (
        <EmptyState
          title={samples.length === 0 ? '还没有任何样本档案' : '没有符合筛选条件的样本'}
          description={
            samples.length === 0
              ? '先登记一份陨石样本，再补录发现地坐标与切片制样信息。'
              : '试着放宽分类、化学群或重量区间条件。'
          }
          actionLabel={samples.length === 0 ? '登记第一份样本' : '清空筛选条件'}
          actionTo={samples.length === 0 ? '/samples/new' : undefined}
          onAction={samples.length === 0 ? undefined : ui.reset}
        />
      ) : (
        <Stack spacing={3}>
          <Box>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
              <Typography variant="h6">母样</Typography>
              <Chip size="small" label={`${parentResults.length} 份`} variant="outlined" />
              <Typography variant="caption" color="text.secondary">
                重量为扣减分样后的剩余重量，可在详情页继续分出子样
              </Typography>
            </Stack>
            {parentResults.length === 0 ? (
              <EmptyState
                title="没有符合条件的母样"
                description="可放宽筛选条件；新登记的样本会作为母样显示在这里。"
                compact
              />
            ) : (
              <Grid container spacing={2}>
                {parentResults.map((s) => (
                  <Grid item xs={12} sm={6} md={4} lg={3} key={s.id}>
                    <SampleCard
                      sample={s}
                      find={findBySample.get(s.id)}
                      sectionCount={sectionCount.get(s.id) ?? 0}
                      analysisCount={analysisCount.get(s.id) ?? 0}
                    />
                  </Grid>
                ))}
              </Grid>
            )}
          </Box>

          <Divider />

          <Box>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
              <Typography variant="h6">分出子样</Typography>
              <Chip size="small" color="secondary" label={`${childResults.length} 份`} variant="outlined" />
              <Typography variant="caption" color="text.secondary">
                由母样分取，编号独立、重量与母样剩余不重复计
              </Typography>
            </Stack>
            {childResults.length === 0 ? (
              <EmptyState
                title="还没有分出子样"
                description="打开任一母样详情，使用「分出子样」填写子样编号、分取重量与存放位置。"
                compact
              />
            ) : (
              <Grid container spacing={2}>
                {childResults.map((s) => (
                  <Grid item xs={12} sm={6} md={4} lg={3} key={s.id}>
                    <SampleCard
                      sample={s}
                      parentSampleNo={s.parentId ? sampleMap.get(s.parentId)?.sampleNo : undefined}
                    />
                  </Grid>
                ))}
              </Grid>
            )}
          </Box>
        </Stack>
      )}
    </Stack>
  );
}
