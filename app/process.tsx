import { toByteArray } from 'base64-js'
import * as Clipboard from 'expo-clipboard'
import * as Haptics from 'expo-haptics'
import { Image } from 'expo-image'
import * as ImageManipulator from 'expo-image-manipulator'
import { LinearGradient } from 'expo-linear-gradient'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as jpeg from 'jpeg-js'
import UPNG from 'upng-js'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { IconSymbol } from '@/components/ui/icon-symbol'

const TARGET_WIDTH = 144
const SALIENCE_WIDTH = 256
const AREA_SLOTS = 5
const SALIENCE_SLOTS = 2
const MAX_COLORS = AREA_SLOTS + SALIENCE_SLOTS
const SAMPLE_STRIDE = 1
const GROUP_HUE_THRESHOLD = 18
const GROUP_LIGHTNESS_THRESHOLD = 10
const MERGE_COVERAGE_THRESHOLD = 4
const MERGE_HUE_THRESHOLD = 10
const MERGE_LIGHTNESS_THRESHOLD = 6
const SEED_DISTANCE = 60
const KM_ITERATIONS = 6
const VIVID_SATURATION_MIN = 40
const SALIENCE_SATURATION_MIN = 10
const SALIENCE_CONTRAST_MIN = 0.03
const SALIENCE_SAMPLE_LIMIT = 4000
const DEDUPE_DISTANCE = 45
const DEDUPE_HUE_DISTANCE = 18
const SALIENCE_HUE_SEPARATION = 60
const WARM_HUE_MIN = 20
const WARM_HUE_MAX = 70
const WARM_FORCE_HUE_DISTANCE = 40
const WARM_BIN_SIZE = 10

const UI_COLORS = {
  background: '#0d0f10',
  text: '#f2f2f2',
  muted: '#b1b4b7',
  border: 'rgba(255, 255, 255, 0.12)',
  card: 'rgba(255, 255, 255, 0.06)',
}

type PaletteSwatch = {
  key: number
  color: string
  percentage: number
  lightness: number
  hue: number
  saturation: number
  count: number
  salienceRank: number | null
}

type PaletteResult = {
  colors: PaletteSwatch[]
  luminanceContrast: number
  colorContrast: number
}

type MetricKey =
  | 'tonalRange'
  | 'hueSpread'
  | 'coverageBalance'
  | 'luminanceContrast'
  | 'colorContrast'
  | 'temperature'
  | 'tint'

export default function ProcessScreen() {
  const { uri } = useLocalSearchParams<{ uri?: string | string[] }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const photoUri = useMemo(() => {
    if (Array.isArray(uri)) {
      return uri[0]
    }

    return uri
  }, [uri])

  const [palette, setPalette] = useState<PaletteResult>({
    colors: [],
    luminanceContrast: 0,
    colorContrast: 0,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [copiedColor, setCopiedColor] = useState<string | null>(null)
  const [activeMetric, setActiveMetric] = useState<MetricKey | null>(null)
  const copiedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!photoUri) {
      return
    }

    let isActive = true

    const process = async () => {
      try {
        setIsLoading(true)
        setErrorMessage(null)

        const result = await getPaletteFromUri(photoUri)

        if (isActive) {
          setPalette(result)
        }
      } catch (error) {
        if (isActive) {
          setErrorMessage('Failed to analyze image')
        }
        console.error('Palette processing failed', error)
      } finally {
        if (isActive) {
          setIsLoading(false)
        }
      }
    }

    process()

    return () => {
      isActive = false
      if (copiedTimeout.current) {
        clearTimeout(copiedTimeout.current)
      }
    }
  }, [photoUri])

  const distributionSwatches = palette.colors
  const sceneMetrics = useMemo(() => {
    return getSceneMetrics(palette.colors)
  }, [palette.colors])
  const metricInfo = useMemo(() => {
    if (!activeMetric) {
      return null
    }

    switch (activeMetric) {
      case 'tonalRange':
        return {
          title: 'Tonal range',
          description:
            'Difference between maximum and minimum lightness in the palette. L is a 0–100 lightness scale.',
        }
      case 'hueSpread':
        return {
          title: 'Hue spread',
          description:
            'Smallest circular hue range that contains the palette hues, weighted by coverage. Degrees are on a 0–360 hue circle.',
        }
      case 'coverageBalance':
        return {
          title: 'Coverage balance',
          description:
            'Primary coverage divided by the sum of other coverages. Displayed as a ratio (×).',
        }
      case 'luminanceContrast':
        return {
          title: 'Luminance contrast',
          description:
            'Brightness spread across the image, scaled to 0–100.',
        }
      case 'colorContrast':
        return {
          title: 'Color contrast',
          description:
            'Hue variation across the image, scaled to 0–100.',
        }
      case 'temperature':
        return {
          title: 'Temperature',
          description:
            'Blue–yellow balance mapped to a Kelvin scale (2000–10000K).',
        }
      case 'tint':
        return {
          title: 'Tint',
          description:
            'Green–magenta balance mapped to a Lightroom-style scale (-150 to 150).',
        }
      default:
        return null
    }
  }, [activeMetric])
  const distributionGroups = useMemo(() => {
    return groupSwatches(distributionSwatches)
  }, [distributionSwatches])
  const lightnessOrder = useMemo(() => {
    return [...palette.colors].sort((a, b) => a.lightness - b.lightness)
  }, [palette.colors])

  const handleCopy = async (color: string) => {
    await Clipboard.setStringAsync(color)
    Haptics.selectionAsync()
    setCopiedColor(color)

    if (copiedTimeout.current) {
      clearTimeout(copiedTimeout.current)
    }

    copiedTimeout.current = setTimeout(() => {
      setCopiedColor(null)
    }, 1200)
  }

  if (!photoUri) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top + 16 }]}>
        <ThemedText
          type="subtitle"
          lightColor={UI_COLORS.text}
          darkColor={UI_COLORS.text}
        >
          No image found
        </ThemedText>
        <Pressable style={styles.retakeButton} onPress={() => router.back()}>
          <ThemedText lightColor={UI_COLORS.text} darkColor={UI_COLORS.text}>
            Retake photo
          </ThemedText>
        </Pressable>
      </ThemedView>
    )
  }

  if (isLoading) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top + 16 }]}>
        <View style={styles.loadingRow}>
          <ActivityIndicator color={UI_COLORS.text} />
          <ThemedText lightColor={UI_COLORS.text} darkColor={UI_COLORS.text}>
            Analyzing colors...
          </ThemedText>
        </View>
      </ThemedView>
    )
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerRow}>
          <View>
            <ThemedText
              type="subtitle"
              lightColor={UI_COLORS.text}
              darkColor={UI_COLORS.text}
            >
              Color data
            </ThemedText>
            <ThemedText
              style={styles.headerMeta}
              lightColor={UI_COLORS.muted}
              darkColor={UI_COLORS.muted}
            >
              {palette.colors.length} colors
            </ThemedText>
          </View>
          <Pressable style={styles.retakeButton} onPress={() => router.back()}>
            <ThemedText lightColor={UI_COLORS.text} darkColor={UI_COLORS.text}>
              Retake photo
            </ThemedText>
          </Pressable>
        </View>

        {errorMessage ? (
          <ThemedText lightColor={UI_COLORS.muted} darkColor={UI_COLORS.muted}>
            {errorMessage}
          </ThemedText>
        ) : null}

        {palette.colors.length > 0 ? (
          <View style={styles.metricsBlock}>
            <View style={styles.metricsRow}>
              <View style={styles.metricsLabelRow}>
                <ThemedText lightColor={UI_COLORS.muted} darkColor={UI_COLORS.muted}>
                  Tonal range
                </ThemedText>
                <Pressable
                  style={styles.infoButton}
                  onPress={() => setActiveMetric('tonalRange')}
                >
                  <IconSymbol name="info.circle" size={16} color={UI_COLORS.muted} />
                </Pressable>
              </View>
              <ThemedText lightColor={UI_COLORS.text} darkColor={UI_COLORS.text}>
                {sceneMetrics.tonalRange}L
              </ThemedText>
            </View>
            <View style={styles.metricsRow}>
              <View style={styles.metricsLabelRow}>
                <ThemedText lightColor={UI_COLORS.muted} darkColor={UI_COLORS.muted}>
                  Hue spread
                </ThemedText>
                <Pressable
                  style={styles.infoButton}
                  onPress={() => setActiveMetric('hueSpread')}
                >
                  <IconSymbol name="info.circle" size={16} color={UI_COLORS.muted} />
                </Pressable>
              </View>
              <ThemedText lightColor={UI_COLORS.text} darkColor={UI_COLORS.text}>
                {sceneMetrics.hueSpread}°
              </ThemedText>
            </View>
            <View style={styles.metricsRow}>
              <View style={styles.metricsLabelRow}>
                <ThemedText lightColor={UI_COLORS.muted} darkColor={UI_COLORS.muted}>
                  Coverage balance
                </ThemedText>
                <Pressable
                  style={styles.infoButton}
                  onPress={() => setActiveMetric('coverageBalance')}
                >
                  <IconSymbol name="info.circle" size={16} color={UI_COLORS.muted} />
                </Pressable>
              </View>
              <ThemedText lightColor={UI_COLORS.text} darkColor={UI_COLORS.text}>
                {sceneMetrics.dominanceRatio}×
              </ThemedText>
            </View>
            <View style={styles.metricsRow}>
              <View style={styles.metricsLabelRow}>
                <ThemedText lightColor={UI_COLORS.muted} darkColor={UI_COLORS.muted}>
                  Luminance contrast
                </ThemedText>
                <Pressable
                  style={styles.infoButton}
                  onPress={() => setActiveMetric('luminanceContrast')}
                >
                  <IconSymbol name="info.circle" size={16} color={UI_COLORS.muted} />
                </Pressable>
              </View>
              <ThemedText lightColor={UI_COLORS.text} darkColor={UI_COLORS.text}>
                {palette.luminanceContrast}
              </ThemedText>
            </View>
            <View style={styles.metricsRow}>
              <View style={styles.metricsLabelRow}>
                <ThemedText lightColor={UI_COLORS.muted} darkColor={UI_COLORS.muted}>
                  Color contrast
                </ThemedText>
                <Pressable
                  style={styles.infoButton}
                  onPress={() => setActiveMetric('colorContrast')}
                >
                  <IconSymbol name="info.circle" size={16} color={UI_COLORS.muted} />
                </Pressable>
              </View>
              <ThemedText lightColor={UI_COLORS.text} darkColor={UI_COLORS.text}>
                {palette.colorContrast}
              </ThemedText>
            </View>
            <View style={styles.metricsRow}>
              <View style={styles.metricsLabelRow}>
                <ThemedText lightColor={UI_COLORS.muted} darkColor={UI_COLORS.muted}>
                  Temperature
                </ThemedText>
                <Pressable
                  style={styles.infoButton}
                  onPress={() => setActiveMetric('temperature')}
                >
                  <IconSymbol name="info.circle" size={16} color={UI_COLORS.muted} />
                </Pressable>
              </View>
              <ThemedText lightColor={UI_COLORS.text} darkColor={UI_COLORS.text}>
                {sceneMetrics.temperatureKelvin}K
              </ThemedText>
            </View>
            <View style={styles.metricsRow}>
              <View style={styles.metricsLabelRow}>
                <ThemedText lightColor={UI_COLORS.muted} darkColor={UI_COLORS.muted}>
                  Tint
                </ThemedText>
                <Pressable
                  style={styles.infoButton}
                  onPress={() => setActiveMetric('tint')}
                >
                  <IconSymbol name="info.circle" size={16} color={UI_COLORS.muted} />
                </Pressable>
              </View>
              <ThemedText lightColor={UI_COLORS.text} darkColor={UI_COLORS.text}>
                {formatSigned(sceneMetrics.tintLR)}
              </ThemedText>
            </View>
          </View>
        ) : null}

        {palette.colors.length > 0 ? (
          <View style={styles.section}>
            <ThemedText
              style={styles.sectionLabel}
              lightColor={UI_COLORS.muted}
              darkColor={UI_COLORS.muted}
            >
              Palette
            </ThemedText>
            <View style={styles.paletteBar}>
              {palette.colors.map((swatch) => (
                <View
                  key={`palette-bar-${swatch.color}`}
                  style={[
                    styles.paletteSegment,
                    {
                      backgroundColor: swatch.color,
                      flex: Math.max(1, swatch.percentage),
                    },
                  ]}
                />
              ))}
            </View>
          </View>
        ) : null}

        {palette.colors.length > 0 ? (
          <View style={styles.gradientBlock}>
            <ThemedText
              style={styles.sectionLabel}
              lightColor={UI_COLORS.muted}
              darkColor={UI_COLORS.muted}
            >
              Gradient map
            </ThemedText>
            <View style={styles.gradientBar}>
              <LinearGradient
                colors={lightnessOrder.map(
                  (swatch) => swatch.color
                ) as [string, string, ...string[]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.gradientOverlay}
              />
            </View>
          </View>
        ) : null}

        {distributionSwatches.length > 0 ? (
          <View style={styles.section}>
            <ThemedText
              style={styles.sectionLabel}
              lightColor={UI_COLORS.muted}
              darkColor={UI_COLORS.muted}
            >
              Color distribution
            </ThemedText>
            {distributionGroups.map((group, groupIndex) => (
              <View
                key={`group-${groupIndex}`}
                style={[
                  styles.groupBlock,
                  groupIndex > 0 && styles.groupBlockDivider,
                ]}
              >
                <View style={styles.distributionGrid}>
                  {group.map((swatch) => (
                    <Pressable
                      key={swatch.color}
                      style={styles.distributionCard}
                      onPress={() => handleCopy(swatch.color)}
                    >
                      <View
                        style={[
                          styles.distributionSwatch,
                          { backgroundColor: swatch.color },
                        ]}
                      />
                      <ThemedText
                        type="defaultSemiBold"
                        lightColor={UI_COLORS.text}
                        darkColor={UI_COLORS.text}
                      >
                        {swatch.color.toUpperCase()}
                      </ThemedText>
                      <ThemedText
                        lightColor={UI_COLORS.muted}
                        darkColor={UI_COLORS.muted}
                      >
                        Coverage {swatch.percentage}%
                      </ThemedText>
                      {copiedColor === swatch.color ? (
                        <ThemedText
                          style={styles.copiedText}
                          lightColor={UI_COLORS.muted}
                          darkColor={UI_COLORS.muted}
                        >
                          Copied
                        </ThemedText>
                      ) : null}
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.imageRow}>
          <Image source={{ uri: photoUri }} style={styles.imagePreview} />
        </View>
      </ScrollView>
      {metricInfo ? (
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setActiveMetric(null)}
        >
          <Pressable style={styles.modalCard} onPress={() => null}>
            <ThemedText
              type="defaultSemiBold"
              lightColor={UI_COLORS.text}
              darkColor={UI_COLORS.text}
            >
              {metricInfo.title}
            </ThemedText>
            <ThemedText lightColor={UI_COLORS.muted} darkColor={UI_COLORS.muted}>
              {metricInfo.description}
            </ThemedText>
            <Pressable
              style={styles.modalButton}
              onPress={() => setActiveMetric(null)}
            >
              <ThemedText lightColor={UI_COLORS.text} darkColor={UI_COLORS.text}>
                Close
              </ThemedText>
            </Pressable>
          </Pressable>
        </Pressable>
      ) : null}
    </ThemedView>
  )
}

async function getPaletteFromUri(uri: string): Promise<PaletteResult> {
  const resized = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: TARGET_WIDTH } }],
    {
      compress: 0.7,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    }
  )

  const salienceResized = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: SALIENCE_WIDTH } }],
    {
      compress: 1,
      format: ImageManipulator.SaveFormat.PNG,
      base64: true,
    }
  )

  if (!resized.base64) {
    return { colors: [], luminanceContrast: 0, colorContrast: 0 }
  }

  const decoded = jpeg.decode(toByteArray(resized.base64), {
    useTArray: true,
  })

  if (!decoded?.data) {
    return { colors: [], luminanceContrast: 0, colorContrast: 0 }
  }

  let salienceDecoded: { data: Uint8Array; width: number; height: number } | null = null
  if (salienceResized.base64) {
    const pngBuffer = toByteArray(salienceResized.base64)
    const pngArrayBuffer = pngBuffer.buffer.slice(
      pngBuffer.byteOffset,
      pngBuffer.byteOffset + pngBuffer.byteLength
    )
    const png = UPNG.decode(pngArrayBuffer)
    const rgba = UPNG.toRGBA8(png)
    if (rgba.length > 0) {
      salienceDecoded = {
        data: new Uint8Array(rgba[0]),
        width: png.width,
        height: png.height,
      }
    }
  }

  const palette = extractPalette(
    decoded.data,
    decoded.width,
    decoded.height,
    salienceDecoded?.data ?? decoded.data,
    salienceDecoded?.width ?? decoded.width,
    salienceDecoded?.height ?? decoded.height
  )

  return palette
}

function extractPalette(
  data: Uint8Array,
  width: number,
  height: number,
  salienceData: Uint8Array,
  salienceWidth: number,
  salienceHeight: number
): PaletteResult {
  const samples = getSamples(data, width, height)
  const sampleCount = samples.length

  if (sampleCount === 0) {
    return { colors: [], luminanceContrast: 0, colorContrast: 0 }
  }

  const areaQuantized = getQuantizedStats(samples)
  const areaColors = Math.min(AREA_SLOTS, areaQuantized.uniqueCount)
  const initialCenters = selectInitialCenters(samples, areaQuantized, areaColors)
  const areaClusters = runKMeans(samples, initialCenters, areaColors)
    .filter((cluster) => cluster.count > 0)
    .sort((a, b) => b.count - a.count)

  const salienceSamples = getSalientSamples(
    salienceData,
    salienceWidth,
    salienceHeight
  )
  const salienceCenters = getSalienceCenters(
    salienceSamples,
    SALIENCE_SLOTS,
    initialCenters
  )
  const salienceScores = rankSalienceCenters(salienceSamples, salienceCenters)
  const warmCandidate = getWarmCandidateFromSalienceData(
    salienceData,
    salienceWidth,
    salienceHeight
  )
  const mergedSalienceScores = mergeWarmCandidate(
    salienceScores,
    warmCandidate
  )

  const composedCenters = composeCenters(
    areaClusters.map((cluster) => cluster.center),
    mergedSalienceScores,
    MAX_COLORS
  )

  const finalClusters = assignSamplesToCenters(samples, composedCenters.centers)
  const swatches = finalClusters
    .filter((cluster) => cluster.count > 0)
    .map((cluster, index) => {
      const { hue, lightness, saturation } = rgbToHsl(
        cluster.center.r,
        cluster.center.g,
        cluster.center.b
      )
      const rawPercent = (cluster.count / sampleCount) * 100
      const salienceRank = composedCenters.salienceRanks[index] ?? null

      return {
        key: index,
        color: `#${toHex(cluster.center.r)}${toHex(cluster.center.g)}${toHex(
          cluster.center.b
        )}`,
        percentage: rawPercent,
        lightness,
        hue,
        saturation,
        count: cluster.count,
        salienceRank,
      }
    })

  const protectedKeys = new Set(
    swatches
      .filter((swatch) => swatch.salienceRank !== null)
      .map((swatch) => swatch.key)
  )

  const merged = mergeLowCoverageSwatches(swatches, sampleCount, protectedKeys)
  const colors = normalizePercentages(merged)
  const { luminanceContrast, colorContrast } = getContrastMetrics(samples)

  return { colors, luminanceContrast, colorContrast }
}

function normalizePercentages(swatches: PaletteSwatch[]): PaletteSwatch[] {
  const total = swatches.reduce((sum, swatch) => sum + swatch.count, 0)

  if (total === 0) {
    return swatches.map((swatch) => ({ ...swatch, percentage: 0 }))
  }

  const raw = swatches.map((swatch) => (swatch.count / total) * 100)
  const floors = raw.map((value) => Math.floor(value))
  let remainder = 100 - floors.reduce((sum, value) => sum + value, 0)

  const fractional = raw.map((value, index) => ({
    index,
    fraction: value - Math.floor(value),
  }))

  fractional.sort((a, b) => b.fraction - a.fraction)

  const adjusted = [...floors]
  let idx = 0

  while (remainder > 0) {
    adjusted[fractional[idx % fractional.length].index] += 1
    remainder -= 1
    idx += 1
  }

  return swatches.map((swatch, index) => ({
    ...swatch,
    percentage: adjusted[index],
  }))
}

function rgbToHsl(r: number, g: number, b: number) {
  const rNorm = r / 255
  const gNorm = g / 255
  const bNorm = b / 255
  const max = Math.max(rNorm, gNorm, bNorm)
  const min = Math.min(rNorm, gNorm, bNorm)
  const delta = max - min

  let hue = 0

  if (delta !== 0) {
    if (max === rNorm) {
      hue = ((gNorm - bNorm) / delta) % 6
    } else if (max === gNorm) {
      hue = (bNorm - rNorm) / delta + 2
    } else {
      hue = (rNorm - gNorm) / delta + 4
    }

    hue *= 60

    if (hue < 0) {
      hue += 360
    }
  }

  const lightnessValue = (max + min) / 2
  const saturation =
    delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightnessValue - 1))
  const lightness = Math.round(lightnessValue * 100)

  return {
    hue,
    lightness,
    saturation: Math.round(saturation * 100),
  }
}

function mergeLowCoverageSwatches(
  swatches: PaletteSwatch[],
  sampleCount: number,
  protectedKeys: Set<number>
): PaletteSwatch[] {
  if (swatches.length <= 1) {
    return swatches
  }

  const primary = swatches[0]
  const result: PaletteSwatch[] = [primary]

  for (let i = 1; i < swatches.length; i += 1) {
    const swatch = swatches[i]
    if (protectedKeys.has(swatch.key)) {
      result.push(swatch)
      continue
    }
    const coverage = (swatch.count / sampleCount) * 100

    if (coverage >= MERGE_COVERAGE_THRESHOLD) {
      result.push(swatch)
      continue
    }

    let merged = false

    for (let j = 1; j < result.length; j += 1) {
      const candidate = result[j]
      if (protectedKeys.has(candidate.key)) {
        continue
      }
      const candidateCoverage = (candidate.count / sampleCount) * 100

      if (candidateCoverage >= MERGE_COVERAGE_THRESHOLD) {
        continue
      }

      if (
        isClose(candidate, swatch, MERGE_HUE_THRESHOLD, MERGE_LIGHTNESS_THRESHOLD)
      ) {
        candidate.count += swatch.count
        merged = true
        break
      }
    }

    if (!merged) {
      result.push(swatch)
    }
  }

  const sorted = result.slice(1).sort((a, b) => b.count - a.count)

  return [primary, ...sorted]
}

function groupSwatches(swatches: PaletteSwatch[]) {
  if (swatches.length === 0) {
    return []
  }

  const groups: PaletteSwatch[][] = []

  for (const swatch of swatches) {
    const matchIndex = findBestGroupIndex(groups, swatch)

    if (matchIndex === null) {
      groups.push([swatch])
      continue
    }

    groups[matchIndex].push(swatch)
  }

  return groups
}

function findBestGroupIndex(
  groups: PaletteSwatch[][],
  swatch: PaletteSwatch
): number | null {
  let bestIndex: number | null = null
  let bestScore = Number.POSITIVE_INFINITY

  for (let i = 0; i < groups.length; i += 1) {
    const anchor = groups[i][0]
    const match = getMatchScore(anchor, swatch)

    if (match === null) {
      continue
    }

    if (match < bestScore) {
      bestScore = match
      bestIndex = i
    }
  }

  return bestIndex
}

function getMatchScore(anchor: PaletteSwatch, swatch: PaletteSwatch) {
  const hueDistance = getHueDistance(
    anchor.hue,
    swatch.hue,
    anchor.lightness,
    swatch.lightness
  )
  const lightnessDistance = Math.abs(anchor.lightness - swatch.lightness)

  const isMatch =
    (hueDistance <= 14 && lightnessDistance <= 8) ||
    (hueDistance <= 22 && lightnessDistance <= 4)

  if (!isMatch) {
    return null
  }

  return hueDistance + lightnessDistance * 1.1
}

function isClose(
  first: PaletteSwatch,
  second: PaletteSwatch,
  hueThreshold: number,
  lightnessThreshold: number
) {
  const hueDistance = getHueDistance(first.hue, second.hue, first.lightness, second.lightness)
  const lightnessDistance = Math.abs(first.lightness - second.lightness)

  return hueDistance <= hueThreshold && lightnessDistance <= lightnessThreshold
}

function getHueDistance(
  firstHue: number,
  secondHue: number,
  firstLightness: number,
  secondLightness: number
) {
  if (firstLightness < 8 && secondLightness < 8) {
    return 0
  }

  const distance = Math.abs(firstHue - secondHue)

  return Math.min(distance, 360 - distance)
}

function getHueFromCenter(center: { r: number; g: number; b: number }) {
  return rgbToHsl(center.r, center.g, center.b).hue
}

function isDistinctCenter(
  candidate: { r: number; g: number; b: number },
  centers: { r: number; g: number; b: number }[]
) {
  for (const center of centers) {
    const distance = Math.sqrt(getDistanceSquared(candidate, center))
    if (distance > DEDUPE_DISTANCE) {
      continue
    }

    const hueDistance = getHueDistance(
      getHueFromCenter(candidate),
      getHueFromCenter(center),
      50,
      50
    )
    if (hueDistance < DEDUPE_HUE_DISTANCE) {
      return false
    }
  }

  return true
}

function getSamples(data: Uint8Array, width: number, height: number) {
  const stride = Math.max(1, SAMPLE_STRIDE)
  const rowStride = width * 4
  const samples: { r: number; g: number; b: number }[] = []

  for (let y = 0; y < height; y += stride) {
    const rowOffset = y * rowStride
    for (let x = 0; x < width; x += stride) {
      const index = rowOffset + x * 4
      samples.push({
        r: data[index],
        g: data[index + 1],
        b: data[index + 2],
      })
    }
  }

  return samples
}

function getQuantizedStats(samples: { r: number; g: number; b: number }[]) {
  const bucketCounts = new Map<number, number>()
  const bucketSums = new Map<number, { r: number; g: number; b: number }>()

  for (const sample of samples) {
    const key = (sample.r >> 3 << 10) | (sample.g >> 3 << 5) | (sample.b >> 3)
    bucketCounts.set(key, (bucketCounts.get(key) ?? 0) + 1)
    const current = bucketSums.get(key) ?? { r: 0, g: 0, b: 0 }
    current.r += sample.r
    current.g += sample.g
    current.b += sample.b
    bucketSums.set(key, current)
  }

  return {
    bucketCounts,
    bucketSums,
    uniqueCount: bucketCounts.size,
  }
}

function getSalientSamples(
  data: Uint8Array,
  width: number,
  height: number
) {
  const stride = Math.max(1, SAMPLE_STRIDE)
  const rowStride = width * 4
  const sampleWidth = Math.ceil(width / stride)
  const sampleHeight = Math.ceil(height / stride)
  const samples: { r: number; g: number; b: number }[] = []
  const luminance: number[] = []
  const saturation: number[] = []

  for (let y = 0; y < height; y += stride) {
    const rowOffset = y * rowStride
    for (let x = 0; x < width; x += stride) {
      const index = rowOffset + x * 4
      const r = data[index]
      const g = data[index + 1]
      const b = data[index + 2]
      samples.push({ r, g, b })
      luminance.push(0.2126 * r + 0.7152 * g + 0.0722 * b)
      const hsl = rgbToHsl(r, g, b)
      saturation.push(hsl.saturation)
    }
  }

  const candidates: { sample: { r: number; g: number; b: number }; score: number }[] = []

  for (let y = 0; y < sampleHeight; y += 1) {
    for (let x = 0; x < sampleWidth; x += 1) {
      const index = y * sampleWidth + x

      let contrastSum = 0
      let neighbors = 0

      if (x + 1 < sampleWidth) {
        contrastSum += Math.abs(luminance[index] - luminance[index + 1])
        neighbors += 1
      }

      if (y + 1 < sampleHeight) {
        contrastSum += Math.abs(
          luminance[index] - luminance[index + sampleWidth]
        )
        neighbors += 1
      }

      if (neighbors === 0) {
        continue
      }

      const contrast = contrastSum / (neighbors * 255)
      const lowSaturation = saturation[index] < SALIENCE_SATURATION_MIN
      const lowContrast = contrast < SALIENCE_CONTRAST_MIN

      if (lowSaturation && lowContrast) {
        continue
      }

      const salience = (saturation[index] / 100) * contrast
      candidates.push({ sample: samples[index], score: salience })
    }
  }

  candidates.sort((a, b) => b.score - a.score)

  return candidates.slice(0, SALIENCE_SAMPLE_LIMIT)
}

function getSalienceCenters(
  samples: { sample: { r: number; g: number; b: number }; score: number }[],
  maxColors: number,
  fallbackCenters: { r: number; g: number; b: number }[]
) {
  if (samples.length === 0) {
    return []
  }

  const seeds: { r: number; g: number; b: number }[] = []
  for (const candidate of samples) {
    if (seeds.length >= maxColors) {
      break
    }

    if (isFarFromCenters(candidate.sample, seeds, SEED_DISTANCE / 1.5)) {
      seeds.push(candidate.sample)
    }
  }

  if (seeds.length === 0) {
    return fallbackCenters.slice(0, Math.min(2, fallbackCenters.length))
  }

  const clusters = runKMeans(
    samples.map((item) => item.sample),
    seeds,
    Math.min(maxColors, seeds.length)
  )

  return clusters.filter((cluster) => cluster.count > 0).map((cluster) => cluster.center)
}

function getWarmCandidateFromSalienceData(
  data: Uint8Array,
  width: number,
  height: number
) {
  const stride = Math.max(1, SAMPLE_STRIDE)
  const rowStride = width * 4
  const sampleWidth = Math.ceil(width / stride)
  const sampleHeight = Math.ceil(height / stride)
  const luminance: number[] = []
  const hueValues: number[] = []
  const saturation: number[] = []
  const samples: { r: number; g: number; b: number }[] = []

  for (let y = 0; y < height; y += stride) {
    const rowOffset = y * rowStride
    for (let x = 0; x < width; x += stride) {
      const index = rowOffset + x * 4
      const r = data[index]
      const g = data[index + 1]
      const b = data[index + 2]
      samples.push({ r, g, b })
      luminance.push(0.2126 * r + 0.7152 * g + 0.0722 * b)
      const hsl = rgbToHsl(r, g, b)
      hueValues.push(hsl.hue)
      saturation.push(hsl.saturation)
    }
  }

  const bins = new Map<number, { score: number; count: number; sum: { r: number; g: number; b: number } }>()

  for (let y = 0; y < sampleHeight; y += 1) {
    for (let x = 0; x < sampleWidth; x += 1) {
      const index = y * sampleWidth + x
      const hue = hueValues[index]
      if (!isWarmHue(hue)) {
        continue
      }

      let contrastSum = 0
      let neighbors = 0

      if (x + 1 < sampleWidth) {
        contrastSum += Math.abs(luminance[index] - luminance[index + 1])
        neighbors += 1
      }

      if (y + 1 < sampleHeight) {
        contrastSum += Math.abs(
          luminance[index] - luminance[index + sampleWidth]
        )
        neighbors += 1
      }

      if (neighbors === 0) {
        continue
      }

      const contrast = contrastSum / (neighbors * 255)
      const lowSaturation = saturation[index] < SALIENCE_SATURATION_MIN
      const lowContrast = contrast < SALIENCE_CONTRAST_MIN

      if (lowSaturation && lowContrast) {
        continue
      }

      const salience = (saturation[index] / 100) * contrast
      const bin = Math.floor((hue - WARM_HUE_MIN) / WARM_BIN_SIZE)
      const current = bins.get(bin) ?? {
        score: 0,
        count: 0,
        sum: { r: 0, g: 0, b: 0 },
      }
      current.score += salience
      current.count += 1
      current.sum.r += samples[index].r
      current.sum.g += samples[index].g
      current.sum.b += samples[index].b
      bins.set(bin, current)
    }
  }

  let best: { center: { r: number; g: number; b: number }; score: number } | null = null

  for (const entry of bins.values()) {
    if (entry.count === 0) {
      continue
    }

    const center = {
      r: Math.round(entry.sum.r / entry.count),
      g: Math.round(entry.sum.g / entry.count),
      b: Math.round(entry.sum.b / entry.count),
    }

    if (!best || entry.score > best.score) {
      best = { center, score: entry.score }
    }
  }

  if (!best) {
    return null
  }

  return {
    center: best.center,
    score: best.score,
    isWarm: true,
    forceWarm: true,
  }
}

function mergeWarmCandidate(
  salienceCenters: {
    center: { r: number; g: number; b: number }
    score: number
    isWarm: boolean
    forceWarm?: boolean
  }[],
  warmCandidate: {
    center: { r: number; g: number; b: number }
    score: number
    isWarm: boolean
    forceWarm?: boolean
  } | null
) {
  if (!warmCandidate) {
    return salienceCenters
  }

  const warmHue = getHueFromCenter(warmCandidate.center)
  const hasSimilarWarm = salienceCenters.some((entry) => {
    if (!entry.isWarm) {
      return false
    }

    const entryHue = getHueFromCenter(entry.center)
    return getHueDistance(entryHue, warmHue, 50, 50) < WARM_BIN_SIZE
  })

  if (hasSimilarWarm) {
    return salienceCenters
  }

  return [warmCandidate, ...salienceCenters]
}

function rankSalienceCenters(
  samples: { sample: { r: number; g: number; b: number }; score: number }[],
  centers: { r: number; g: number; b: number }[]
) {
  if (centers.length === 0) {
    return []
  }

  const scores = new Array(centers.length).fill(0)

  for (const item of samples) {
    let bestIndex = 0
    let bestDistance = Number.POSITIVE_INFINITY

    for (let i = 0; i < centers.length; i += 1) {
      const distance = getDistanceSquared(item.sample, centers[i])
      if (distance < bestDistance) {
        bestDistance = distance
        bestIndex = i
      }
    }

    scores[bestIndex] += item.score
  }

  return centers
    .map((center, index) => ({
      center,
      score: scores[index],
      isWarm: isWarmHue(getHueFromCenter(center)),
      forceWarm: false,
    }))
    .sort((a, b) => b.score - a.score)
}

function composeCenters(
  areaCenters: { r: number; g: number; b: number }[],
  salienceCenters: {
    center: { r: number; g: number; b: number }
    score: number
    isWarm: boolean
    forceWarm?: boolean
  }[],
  maxColors: number
) {
  const centers: { r: number; g: number; b: number }[] = []
  const salienceRanks: Array<number | null> = []

  const selectedSalience = selectSalienceByHueDiversity(
    salienceCenters,
    SALIENCE_SLOTS
  )

  for (const center of areaCenters.slice(0, AREA_SLOTS)) {
    centers.push(center)
    salienceRanks.push(null)
  }

  let salienceRank = 0
  for (const entry of selectedSalience) {
    if (centers.length >= maxColors || salienceRank >= SALIENCE_SLOTS) {
      break
    }

    if (!isDistinctCenter(entry.center, centers)) {
      if (!entry.isWarm) {
        continue
      }

      const entryHue = getHueFromCenter(entry.center)
      const requiredDistance = entry.forceWarm
        ? WARM_FORCE_HUE_DISTANCE
        : DEDUPE_HUE_DISTANCE
      const hasHueSeparation = centers.every((center) => {
        const centerHue = getHueFromCenter(center)
        return getHueDistance(centerHue, entryHue, 50, 50) >= requiredDistance
      })

      if (!hasHueSeparation) {
        continue
      }
    }

    centers.push(entry.center)
    salienceRanks.push(salienceRank)
    salienceRank += 1
  }

  return { centers, salienceRanks }
}

function selectSalienceByHueDiversity(
  salienceCenters: {
    center: { r: number; g: number; b: number }
    score: number
    isWarm: boolean
    forceWarm?: boolean
  }[],
  slotCount: number
) {
  if (salienceCenters.length === 0 || slotCount === 0) {
    return []
  }

  const selected: {
    center: { r: number; g: number; b: number }
    score: number
    isWarm: boolean
    forceWarm?: boolean
  }[] = []
  const candidates = salienceCenters.slice(0, Math.max(12, slotCount))

  const warmCandidate =
    candidates.find((candidate) => candidate.forceWarm) ||
    candidates.find((candidate) => candidate.isWarm)
  if (warmCandidate) {
    selected.push(warmCandidate)
  }

  if (candidates.length > 0 && selected.length < slotCount) {
    if (!selected.includes(candidates[0])) {
      selected.push(candidates[0])
    }
  }

  while (selected.length < slotCount) {
    let bestCandidate: (typeof selected)[number] | null = null
    let bestDistance = -1

    for (const candidate of candidates) {
      if (selected.includes(candidate)) {
        continue
      }

      const candidateHue = getHueFromCenter(candidate.center)
      const minHueDistance = selected.reduce((minDistance, entry) => {
        const entryHue = getHueFromCenter(entry.center)
        const distance = getHueDistance(entryHue, candidateHue, 50, 50)
        return Math.min(minDistance, distance)
      }, Number.POSITIVE_INFINITY)

      const score =
        minHueDistance >= SALIENCE_HUE_SEPARATION
          ? minHueDistance * 2 + candidate.score
          : minHueDistance + candidate.score * 0.5

      if (score > bestDistance) {
        bestDistance = score
        bestCandidate = candidate
      }
    }

    if (!bestCandidate) {
      break
    }

    selected.push(bestCandidate)
  }

  return selected
}

function isWarmHue(hue: number) {
  return hue >= WARM_HUE_MIN && hue <= WARM_HUE_MAX
}

function assignSamplesToCenters(
  samples: { r: number; g: number; b: number }[],
  centers: { r: number; g: number; b: number }[]
) {
  const counts = new Array(centers.length).fill(0)

  for (const sample of samples) {
    let bestIndex = 0
    let bestDistance = Number.POSITIVE_INFINITY

    for (let j = 0; j < centers.length; j += 1) {
      const distance = getDistanceSquared(sample, centers[j])
      if (distance < bestDistance) {
        bestDistance = distance
        bestIndex = j
      }
    }

    counts[bestIndex] += 1
  }

  return centers.map((center, index) => ({
    center,
    count: counts[index],
  }))
}

function selectInitialCenters(
  samples: { r: number; g: number; b: number }[],
  stats: ReturnType<typeof getQuantizedStats>,
  maxColors: number
) {
  const sortedBuckets = Array.from(stats.bucketCounts.entries()).sort(
    (a, b) => b[1] - a[1]
  )

  const [dominantKey] = sortedBuckets[0]
  const dominantSum = stats.bucketSums.get(dominantKey)!
  const dominantCount = stats.bucketCounts.get(dominantKey)!
  const centers = [
    {
      r: Math.round(dominantSum.r / dominantCount),
      g: Math.round(dominantSum.g / dominantCount),
      b: Math.round(dominantSum.b / dominantCount),
    },
  ]

  const vividCandidates = samples
    .map((sample) => ({
      ...sample,
      saturation: rgbToHsl(sample.r, sample.g, sample.b).saturation,
    }))
    .sort((a, b) => b.saturation - a.saturation)
    .slice(0, 120)

  for (const candidate of vividCandidates) {
    if (centers.length >= maxColors) {
      break
    }

    if (candidate.saturation < VIVID_SATURATION_MIN) {
      break
    }

    if (isFarFromCenters(candidate, centers, SEED_DISTANCE)) {
      centers.push({ r: candidate.r, g: candidate.g, b: candidate.b })
    }
  }

  let bucketIndex = 1
  while (centers.length < maxColors && bucketIndex < sortedBuckets.length) {
    const [key] = sortedBuckets[bucketIndex]
    const sum = stats.bucketSums.get(key)!
    const count = stats.bucketCounts.get(key)!
    const candidate = {
      r: Math.round(sum.r / count),
      g: Math.round(sum.g / count),
      b: Math.round(sum.b / count),
    }

    if (isFarFromCenters(candidate, centers, SEED_DISTANCE / 1.5)) {
      centers.push(candidate)
    }

    bucketIndex += 1
  }

  return centers
}

function isFarFromCenters(
  sample: { r: number; g: number; b: number },
  centers: { r: number; g: number; b: number }[],
  threshold: number
) {
  const thresholdSquared = threshold * threshold

  for (const center of centers) {
    if (getDistanceSquared(sample, center) < thresholdSquared) {
      return false
    }
  }

  return true
}

function runKMeans(
  samples: { r: number; g: number; b: number }[],
  initialCenters: { r: number; g: number; b: number }[],
  maxColors: number
) {
  const centers = initialCenters.slice(0, maxColors)
  const assignments = new Array(samples.length).fill(0)

  for (let iteration = 0; iteration < KM_ITERATIONS; iteration += 1) {
    const sums = centers.map(() => ({ r: 0, g: 0, b: 0, count: 0 }))

    for (let i = 0; i < samples.length; i += 1) {
      const sample = samples[i]
      let bestIndex = 0
      let bestDistance = Number.POSITIVE_INFINITY

      for (let j = 0; j < centers.length; j += 1) {
        const distance = getDistanceSquared(sample, centers[j])
        if (distance < bestDistance) {
          bestDistance = distance
          bestIndex = j
        }
      }

      assignments[i] = bestIndex
      sums[bestIndex].r += sample.r
      sums[bestIndex].g += sample.g
      sums[bestIndex].b += sample.b
      sums[bestIndex].count += 1
    }

    for (let j = 0; j < centers.length; j += 1) {
      if (sums[j].count === 0) {
        const fallback = findFallbackCenter(samples, centers)
        centers[j] = fallback
        continue
      }

      centers[j] = {
        r: Math.round(sums[j].r / sums[j].count),
        g: Math.round(sums[j].g / sums[j].count),
        b: Math.round(sums[j].b / sums[j].count),
      }
    }
  }

  const clusterCounts = new Map<number, number>()
  for (const index of assignments) {
    clusterCounts.set(index, (clusterCounts.get(index) ?? 0) + 1)
  }

  return centers.map((center, index) => ({
    center,
    count: clusterCounts.get(index) ?? 0,
  }))
}

function findFallbackCenter(
  samples: { r: number; g: number; b: number }[],
  centers: { r: number; g: number; b: number }[]
) {
  const sorted = samples
    .map((sample) => ({
      ...sample,
      saturation: rgbToHsl(sample.r, sample.g, sample.b).saturation,
    }))
    .sort((a, b) => b.saturation - a.saturation)

  for (const candidate of sorted) {
    if (isFarFromCenters(candidate, centers, SEED_DISTANCE / 1.5)) {
      return { r: candidate.r, g: candidate.g, b: candidate.b }
    }
  }

  return centers[0]
}

function getDistanceSquared(
  first: { r: number; g: number; b: number },
  second: { r: number; g: number; b: number }
) {
  const rDiff = first.r - second.r
  const gDiff = first.g - second.g
  const bDiff = first.b - second.b

  return rDiff * rDiff + gDiff * gDiff + bDiff * bDiff
}

function getSceneMetrics(swatches: PaletteSwatch[]) {
  if (swatches.length === 0) {
    return {
      tonalRange: 0,
      hueSpread: 0,
      dominanceRatio: '0.0',
      temperatureKelvin: 0,
      tintLR: 0,
    }
  }

  const lightnessValues = swatches.map((swatch) => swatch.lightness)
  const maxLightness = Math.max(...lightnessValues)
  const minLightness = Math.min(...lightnessValues)
  const tonalRange = Math.round(maxLightness - minLightness)

  const hueSpread = getHueSpread(swatches)
  const totalCoverage = swatches.reduce(
    (sum, swatch) => sum + swatch.percentage,
    0
  )
  const primaryCoverage = swatches[0]?.percentage ?? 0
  const otherCoverage = Math.max(1, totalCoverage - primaryCoverage)
  const dominanceRatio = (primaryCoverage / otherCoverage).toFixed(1)

  const weighted = swatches.reduce(
    (accumulator, swatch) => {
      const weight = swatch.percentage / 100
      const rgb = hexToRgb(swatch.color)

      return {
        r: accumulator.r + rgb.r * weight,
        g: accumulator.g + rgb.g * weight,
        b: accumulator.b + rgb.b * weight,
      }
    },
    { r: 0, g: 0, b: 0 }
  )

  const temperature = Math.round(((weighted.r - weighted.b) / 255) * 100)
  const tint = Math.round(
    ((weighted.g - (weighted.r + weighted.b) / 2) / 255) * 100
  )

  const temperatureKelvin = Math.round(
    mapRange(clampValue(temperature, -100, 100), -100, 100, 2000, 10000)
  )
  const tintLR = Math.round(
    mapRange(clampValue(tint, -100, 100), -100, 100, -150, 150)
  )

  return {
    tonalRange,
    hueSpread,
    dominanceRatio,
    temperatureKelvin,
    tintLR,
  }
}

function getContrastMetrics(samples: { r: number; g: number; b: number }[]) {
  let mean = 0
  let m2 = 0
  let count = 0
  let sumX = 0
  let sumY = 0
  let weightSum = 0

  for (const sample of samples) {
    const luminance =
      0.2126 * sample.r + 0.7152 * sample.g + 0.0722 * sample.b
    count += 1
    const delta = luminance - mean
    mean += delta / count
    m2 += delta * (luminance - mean)

    const hsl = rgbToHsl(sample.r, sample.g, sample.b)
    const weight = hsl.saturation / 100
    if (weight > 0) {
      const angle = (hsl.hue * Math.PI) / 180
      sumX += Math.cos(angle) * weight
      sumY += Math.sin(angle) * weight
      weightSum += weight
    }
  }

  const variance = count > 0 ? m2 / count : 0
  const stdDev = Math.sqrt(variance)
  const luminanceContrast = Math.round((stdDev / 255) * 100)

  if (weightSum === 0) {
    return { luminanceContrast, colorContrast: 0 }
  }

  const vectorLength = Math.sqrt(sumX * sumX + sumY * sumY) / weightSum
  const colorContrast = Math.round((1 - vectorLength) * 100)

  return { luminanceContrast, colorContrast }
}

function getHueSpread(swatches: PaletteSwatch[]) {
  const expandedHues: number[] = []

  for (const swatch of swatches) {
    const weight = Math.max(1, swatch.percentage)

    for (let i = 0; i < weight; i += 1) {
      expandedHues.push(swatch.hue)
    }
  }

  if (expandedHues.length < 2) {
    return 0
  }

  const sorted = expandedHues.slice().sort((a, b) => a - b)
  let maxGap = 0

  for (let i = 1; i < sorted.length; i += 1) {
    const gap = sorted[i] - sorted[i - 1]
    if (gap > maxGap) {
      maxGap = gap
    }
  }

  const wrapGap = sorted[0] + 360 - sorted[sorted.length - 1]
  if (wrapGap > maxGap) {
    maxGap = wrapGap
  }

  return Math.round(360 - maxGap)
}

function clampColor(value: number) {
  return Math.max(0, Math.min(255, value))
}

function toHex(value: number) {
  return value.toString(16).padStart(2, '0')
}

function formatSigned(value: number) {
  return value > 0 ? `+${value}` : `${value}`
}

function mapRange(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
) {
  if (inMax === inMin) {
    return outMin
  }

  const ratio = (value - inMin) / (inMax - inMin)

  return outMin + ratio * (outMax - outMin)
}

function clampValue(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function hexToRgb(hex: string) {
  const normalized = hex.replace('#', '')
  const r = parseInt(normalized.slice(0, 2), 16)
  const g = parseInt(normalized.slice(2, 4), 16)
  const b = parseInt(normalized.slice(4, 6), 16)

  return { r, g, b }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: UI_COLORS.background,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerMeta: {
    marginTop: 4,
  },
  retakeButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    backgroundColor: UI_COLORS.card,
  },
  loadingRow: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  section: {
    gap: 12,
  },
  sectionLabel: {
    textTransform: 'uppercase',
    fontSize: 12,
    letterSpacing: 1.2,
  },
  copiedText: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  distributionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  paletteBar: {
    flexDirection: 'row',
    height: 36,
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: UI_COLORS.border,
  },
  paletteSegment: {
    height: '100%',
  },
  metricsBlock: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    backgroundColor: UI_COLORS.card,
    gap: 10,
  },
  gradientBlock: {
    gap: 12,
  },
  gradientBar: {
    flexDirection: 'row',
    height: 18,
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    position: 'relative',
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  metricsLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoButton: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    backgroundColor: UI_COLORS.background,
    padding: 20,
    gap: 12,
  },
  modalButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    backgroundColor: UI_COLORS.card,
  },
  groupBlock: {
    gap: 12,
  },
  groupBlockDivider: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: UI_COLORS.border,
  },
  distributionCard: {
    width: '48%',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    backgroundColor: UI_COLORS.card,
    gap: 8,
  },
  distributionSwatch: {
    width: '100%',
    height: 48,
    borderRadius: 12,
  },
  imageRow: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: UI_COLORS.border,
  },
  imagePreview: {
    width: '100%',
    height: 180,
  },
})
