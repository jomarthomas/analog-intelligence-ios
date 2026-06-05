/**
 * Retouch (dust & scratch spot-heal) — `retouch/[id]`.
 *
 * A Skia tap-to-heal tool on the final positive. The user taps/drags over dust
 * specks or scratches; each tap drops a soft-edged **clone patch** that copies
 * clean texture from just beside the spot, covering the blemish — the manual
 * equivalent of SilverFast's iSRD, the #1 pain in film scanning.
 *
 * `drawHealed()` paints the base image + every clone patch in IMAGE-pixel space,
 * and is shared by the on-screen preview (a recorded `<Picture>`) and the
 * full-resolution export (an offscreen `Skia.Surface`) — so what you see is
 * exactly what gets saved. On "Apply" the healed full-res JPEG replaces the
 * frame's processed image via `commitProcessedImage`.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  BlendMode,
  Canvas,
  Group,
  ImageFormat,
  Picture,
  Skia,
  TileMode,
  useImage,
  type SkCanvas,
  type SkImage,
} from '@shopify/react-native-skia';
import { File, Paths } from 'expo-file-system';

import { Button } from '@/theme/button';
import { Screen } from '@/theme/screen';
import { useTheme } from '@/hooks/use-theme';
import { Palette, Radius, Spacing, FontSize, FontWeight } from '@/constants/theme';
import { useGalleryStore } from '@/state/galleryStore';
import { commitProcessedImage } from '@/storage/imageRepository';

/** A heal mark in IMAGE-pixel coordinates. */
type Spot = { x: number; y: number; r: number };

const MIN_BRUSH = 10;
const MAX_BRUSH = 90;

/**
 * Paint the base image plus a soft-edged clone over every spot, in image-pixel
 * space. Each clone copies the image shifted by a small offset (clean texture
 * beside the blemish), masked by a radial gradient so the edge feathers in.
 */
function drawHealed(canvas: SkCanvas, image: SkImage, spots: Spot[]): void {
  const w = image.width();
  const h = image.height();
  canvas.drawImage(image, 0, 0);

  for (const s of spots) {
    // Pick a clone source just beside the spot, flipped to stay in-frame.
    let dx = s.r * 2.4;
    let dy = 0;
    if (s.x + dx + s.r > w) dx = -dx;
    if (s.x + dx - s.r < 0) {
      dx = 0;
      dy = s.r * 2.4;
      if (s.y + dy + s.r > h) dy = -dy;
    }

    canvas.saveLayer();
    // Clone content: the image translated so the source region lands on the spot.
    canvas.save();
    canvas.translate(-dx, -dy);
    canvas.drawImage(image, 0, 0);
    canvas.restore();
    // Feathered alpha mask (opaque centre → transparent edge) keeps the patch
    // only inside the brush and blends its rim seamlessly.
    const mask = Skia.Paint();
    mask.setBlendMode(BlendMode.DstIn);
    mask.setShader(
      Skia.Shader.MakeRadialGradient(
        { x: s.x, y: s.y },
        s.r,
        [Skia.Color('white'), Skia.Color('rgba(255,255,255,0)')],
        [0.6, 1],
        TileMode.Clamp,
      ),
    );
    canvas.drawRect(Skia.XYWHRect(s.x - s.r, s.y - s.r, s.r * 2, s.r * 2), mask);
    canvas.restore();
  }
}

export default function RetouchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();

  const image = useGalleryStore((s) => s.allImages.find((i) => i.id === id));
  const loadGallery = useGalleryStore((s) => s.loadGallery);

  // Retouch operates on the final positive — it requires a processed frame.
  const sourceUri = image?.processedUri ?? null;
  const skImage = useImage(sourceUri);

  const [spots, setSpots] = useState<Spot[]>([]);
  const [brush, setBrush] = useState(30);
  const [saving, setSaving] = useState(false);
  const [box, setBox] = useState({ w: 0, h: 0 });

  // Contain-fit the image into the available canvas box.
  const fit = useMemo(() => {
    if (!skImage || box.w === 0 || box.h === 0) return null;
    const iw = skImage.width();
    const ih = skImage.height();
    const scale = Math.min(box.w / iw, box.h / ih);
    return { scale, dispW: iw * scale, dispH: ih * scale, iw, ih };
  }, [skImage, box]);

  // Re-record the preview picture whenever the spots change.
  const picture = useMemo(() => {
    if (!skImage) return null;
    const rec = Skia.PictureRecorder();
    const cv = rec.beginRecording(
      Skia.XYWHRect(0, 0, skImage.width(), skImage.height()),
    );
    drawHealed(cv, skImage, spots);
    return rec.finishRecordingAsPicture();
  }, [skImage, spots]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox({ w: width, h: height });
  }, []);

  const addSpot = useCallback(
    (e: GestureResponderEvent) => {
      if (!fit) return;
      const { locationX, locationY } = e.nativeEvent;
      const x = locationX / fit.scale;
      const y = locationY / fit.scale;
      if (x < 0 || y < 0 || x > fit.iw || y > fit.ih) return;
      setSpots((prev) => [...prev, { x, y, r: brush / fit.scale }]);
    },
    [fit, brush],
  );

  const handleApply = useCallback(async () => {
    const params = image?.processParams;
    if (!skImage || spots.length === 0 || !id || !params) return;
    setSaving(true);
    try {
      const surface = Skia.Surface.MakeOffscreen(skImage.width(), skImage.height());
      if (!surface) throw new Error('Could not allocate an offscreen surface.');
      drawHealed(surface.getCanvas(), skImage, spots);
      surface.flush();
      const bytes = surface
        .makeImageSnapshot()
        .encodeToBytes(ImageFormat.JPEG, 95);
      const out = new File(Paths.cache, `retouch-${Date.now()}.jpg`);
      out.write(bytes);
      await commitProcessedImage({
        imageId: id,
        sourceCacheUri: out.uri,
        processParams: params,
      });
      await loadGallery();
      router.back();
    } catch {
      Alert.alert('Retouch failed', 'Couldn’t save the healed image. Please try again.');
      setSaving(false);
    }
  }, [skImage, spots, id, image, loadGallery, router]);

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <View style={[styles.navBar, { borderBottomColor: theme.divider }]}>
        <Button variant="ghost" size="sm" onPress={() => router.back()}>
          Cancel
        </Button>
        <Text style={[styles.navTitle, { color: theme.text }]}>RETOUCH</Text>
        <View style={styles.navSpacer} />
      </View>

      <View style={styles.canvasBox} onLayout={onLayout}>
        {skImage && fit ? (
          <View
            style={{ width: fit.dispW, height: fit.dispH }}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={addSpot}
            onResponderMove={addSpot}>
            <Canvas style={{ width: fit.dispW, height: fit.dispH }}>
              <Group transform={[{ scale: fit.scale }]}>
                {picture ? <Picture picture={picture} /> : null}
              </Group>
            </Canvas>
          </View>
        ) : sourceUri == null ? (
          <Text style={[styles.hint, { color: theme.textSecondary }]}>
            Process this scan in Adjust first, then come back to retouch.
          </Text>
        ) : (
          <ActivityIndicator color={theme.accent} />
        )}
      </View>

      <View style={styles.controls}>
        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          {spots.length === 0
            ? 'Tap or drag over dust specks and scratches to heal them.'
            : `${spots.length} spot${spots.length === 1 ? '' : 's'} healed`}
        </Text>

        <View style={styles.brushRow}>
          <Text style={[styles.brushLabel, { color: theme.textSecondary }]}>Brush</Text>
          <Slider
            style={styles.slider}
            minimumValue={MIN_BRUSH}
            maximumValue={MAX_BRUSH}
            value={brush}
            onValueChange={setBrush}
            minimumTrackTintColor={theme.accent}
            maximumTrackTintColor={theme.divider}
            thumbTintColor={theme.accent}
          />
        </View>

        <View style={styles.actions}>
          <Button
            variant="secondary"
            size="sm"
            disabled={spots.length === 0 || saving}
            onPress={() => setSpots((prev) => prev.slice(0, -1))}>
            Undo
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={spots.length === 0 || saving}
            onPress={() => setSpots([])}>
            Clear
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={saving}
            disabled={spots.length === 0}
            onPress={() => void handleApply()}>
            Apply
          </Button>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, letterSpacing: 2 },
  navSpacer: { width: 64 },
  canvasBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.black,
    margin: Spacing.md,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  controls: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg, gap: Spacing.sm },
  hint: { fontSize: FontSize.sm, textAlign: 'center' },
  brushRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  brushLabel: { fontSize: FontSize.sm, width: 48 },
  slider: { flex: 1, height: 36 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm },
});
