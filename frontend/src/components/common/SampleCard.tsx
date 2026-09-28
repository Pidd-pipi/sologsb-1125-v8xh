import { Box, Card, CardActionArea, CardContent, Chip, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import {
  FALL_OR_FIND_LABELS,
  WEATHERING_LABELS,
  isChildSample,
  type MeteoriteSample,
} from '../../types/sample';
import type { FindRecord } from '../../types/find';
import { formatWeight } from '../../utils/format';
import { formatCoordinate } from '../../utils/geo';
import { ClassificationBadge } from './Badge';

interface SampleCardProps {
  sample: MeteoriteSample;
  find?: FindRecord;
  sectionCount?: number;
  analysisCount?: number;
  to?: string;
  /** 子样卡片传入母样编号，用于显示来源 */
  parentSampleNo?: string;
}

/** 样本摘要卡片：被 / 与 /samples/:id 消费 */
export function SampleCard({
  sample,
  find,
  sectionCount = 0,
  analysisCount = 0,
  to,
  parentSampleNo,
}: SampleCardProps) {
  const child = isChildSample(sample);
  // 子样不挂发现地/切片，缺项角标只对母样有意义
  const missing: string[] = [];
  if (!child) {
    if (!find) missing.push('缺坐标');
    if (sectionCount === 0) missing.push('缺切片');
  }

  return (
    <Card
      variant="outlined"
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 2.5,
        transition: 'box-shadow .2s ease, transform .2s ease',
        '&:hover': { boxShadow: 4, transform: 'translateY(-2px)' },
      }}
    >
      <CardActionArea
        component={RouterLink}
        to={to ?? `/samples/${sample.id}`}
        sx={{ flex: 1, alignItems: 'stretch' }}
      >
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, height: '100%' }}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
            <Box>
              <Typography variant="overline" color="text.secondary" lineHeight={1.2}>
                {child ? '子样编号' : '样本编号'}
              </Typography>
              <Typography variant="h6" fontWeight={700} letterSpacing="0.02em">
                {sample.sampleNo}
              </Typography>
            </Box>
            <Stack alignItems="flex-end" spacing={0.5}>
              <Typography variant="h6" fontWeight={700} color="primary.main" whiteSpace="nowrap">
                {formatWeight(sample.totalWeight)}
              </Typography>
              {child ? <Chip size="small" color="secondary" variant="outlined" label="分出子样" /> : null}
            </Stack>
          </Stack>

          <ClassificationBadge category={sample.category} group={sample.chemicalGroup} />

          <Typography variant="body2" color="text.secondary">
            {FALL_OR_FIND_LABELS[sample.fallOrFind]} · {WEATHERING_LABELS[sample.weathering]}
          </Typography>

          {child ? (
            <Typography variant="body2" color="text.secondary">
              来源母样：{parentSampleNo ?? '未知母样'}
            </Typography>
          ) : (
            <Typography variant="body2" color="text.secondary">
              发现地：{find ? `${find.region} · ${find.placeName}` : '未登记'}
            </Typography>
          )}

          {!child && find ? (
            <Typography variant="caption" color="text.secondary">
              {formatCoordinate(find.longitude, find.latitude)} · 来源
              {find.coordinateSource === 'gps' ? 'GPS' : '文献'}
            </Typography>
          ) : null}

          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 'auto', pt: 1 }}>
            {child ? (
              <Chip size="small" variant="outlined" label="继承母样分类" />
            ) : (
              <>
                <Chip size="small" variant="outlined" label={`切片 ${sectionCount}`} />
                <Chip size="small" variant="outlined" label={`检测 ${analysisCount}`} />
              </>
            )}
            {missing.map((m) => (
              <Chip key={m} size="small" color="warning" label={m} />
            ))}
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

export default SampleCard;
