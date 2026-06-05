/**
 * Monochrome SVG line icons for the tab bar.
 *
 * The app is black & white, so tab icons must be single-colour and respect the
 * active/inactive tint. (Emoji fallbacks render in full colour, which breaks the
 * monochrome language; @expo/vector-icons isn't installed.) These are minimal
 * stroke icons drawn with react-native-svg — a dependency the app already uses.
 */

import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import type { ColorValue } from 'react-native';

type GlyphProps = {
  color: ColorValue;
  size: number;
  /** Slightly heavier stroke when the tab is focused. */
  focused?: boolean;
};

const VB = 24;

export function CameraGlyph({ color, size, focused }: GlyphProps) {
  const w = focused ? 1.9 : 1.6;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${VB} ${VB}`} fill="none">
      <Path
        d="M3 8.5A1.5 1.5 0 0 1 4.5 7H7l1.1-1.9A1 1 0 0 1 9 4.6h6a1 1 0 0 1 .9.5L17 7h2.5A1.5 1.5 0 0 1 21 8.5V18A1.5 1.5 0 0 1 19.5 19.5h-15A1.5 1.5 0 0 1 3 18Z"
        stroke={color}
        strokeWidth={w}
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={13} r={3.2} stroke={color} strokeWidth={w} />
    </Svg>
  );
}

export function GalleryGlyph({ color, size, focused }: GlyphProps) {
  const w = focused ? 1.9 : 1.6;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${VB} ${VB}`} fill="none">
      <Rect x={3.5} y={5} width={17} height={14} rx={2.6} stroke={color} strokeWidth={w} />
      <Circle cx={9} cy={10} r={1.5} stroke={color} strokeWidth={w} />
      <Path
        d="M4.5 17.5 9 13l3 3 3.5-3.5 4 4"
        stroke={color}
        strokeWidth={w}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function InsightsGlyph({ color, size, focused }: GlyphProps) {
  const w = focused ? 2.6 : 2.2;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${VB} ${VB}`} fill="none">
      <Line x1={6} y1={20} x2={6} y2={13} stroke={color} strokeWidth={w} strokeLinecap="round" />
      <Line x1={12} y1={20} x2={12} y2={6} stroke={color} strokeWidth={w} strokeLinecap="round" />
      <Line x1={18} y1={20} x2={18} y2={10} stroke={color} strokeWidth={w} strokeLinecap="round" />
    </Svg>
  );
}

export function SettingsGlyph({ color, size, focused }: GlyphProps) {
  const w = focused ? 1.9 : 1.6;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${VB} ${VB}`} fill="none">
      <Line x1={4} y1={8.5} x2={20} y2={8.5} stroke={color} strokeWidth={w} strokeLinecap="round" />
      <Line x1={4} y1={15.5} x2={20} y2={15.5} stroke={color} strokeWidth={w} strokeLinecap="round" />
      <Circle cx={15} cy={8.5} r={2.6} stroke={color} strokeWidth={w} fill={color} />
      <Circle cx={9} cy={15.5} r={2.6} stroke={color} strokeWidth={w} fill={color} />
    </Svg>
  );
}
