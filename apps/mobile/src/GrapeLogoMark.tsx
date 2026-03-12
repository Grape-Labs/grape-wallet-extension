import Svg, { Circle, Path } from 'react-native-svg';

type Props = {
  size?: number;
  color?: string;
  opacity?: number;
};

export function GrapeLogoMark({ size = 42, color = '#FFFFFF', opacity = 1 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <Path
        d="M19 11C24 5 34 5 39 11C42 15 42 22 39 27"
        stroke={color}
        strokeOpacity={opacity}
        strokeWidth={4.5}
        strokeLinecap="round"
      />
      <Path
        d="M39 11C44 15 50 15 55 11"
        stroke={color}
        strokeOpacity={opacity}
        strokeWidth={4.5}
        strokeLinecap="round"
      />
      <Circle cx="20" cy="25" r="7" fill={color} fillOpacity={opacity} />
      <Circle cx="32" cy="25" r="7" fill={color} fillOpacity={opacity} />
      <Circle cx="44" cy="25" r="7" fill={color} fillOpacity={opacity} />
      <Circle cx="26" cy="37" r="7" fill={color} fillOpacity={opacity} />
      <Circle cx="38" cy="37" r="7" fill={color} fillOpacity={opacity} />
      <Circle cx="32" cy="49" r="7" fill={color} fillOpacity={opacity} />
    </Svg>
  );
}
