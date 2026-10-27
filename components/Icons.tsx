import type { SVGProps } from "react";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "size"> {
  size?: number;
}

function baseProps({
  size = 20,
  ...props
}: IconProps): SVGProps<SVGSVGElement> {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    focusable: false,
    ...props,
  };
}

export function MoveIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M5 3.5 18.5 11l-6 1.4-2.6 5.8L5 3.5Z" />
    </svg>
  );
}

export function PointIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M12 3.2c.7 4.5 2.3 6.1 6.8 6.8-4.5.7-6.1 2.3-6.8 6.8-.7-4.5-2.3-6.1-6.8-6.8C9.7 9.3 11.3 7.7 12 3.2Z" />
      <circle cx="18.6" cy="18.2" r="1.5" />
    </svg>
  );
}

export function SegmentIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="5.5" cy="17.5" r="2.2" />
      <circle cx="18.5" cy="6.5" r="2.2" />
      <path d="m7.3 16 9.4-8" />
    </svg>
  );
}

export function UndoIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M9 7 4 12l5 5" />
      <path d="M5 12h8.2c3.3 0 5.8 2.2 5.8 5.2" />
    </svg>
  );
}

export function RedoIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="m15 7 5 5-5 5" />
      <path d="M19 12h-8.2C7.5 12 5 14.2 5 17.2" />
    </svg>
  );
}

export function GalleryIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <rect x="3.2" y="4.2" width="17.6" height="15.6" rx="2.4" />
      <circle cx="8" cy="9" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="16.2" cy="14.8" r="1.1" fill="currentColor" stroke="none" />
      <path d="M8 9 16.2 14.8M8.6 17.5 5.4 14.2M16.2 14.8l2.4-2.5" opacity=".65" />
    </svg>
  );
}

export function HelpIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="12" cy="12" r="8.7" />
      <path d="M9.6 9.2c.2-1.5 1.2-2.4 2.7-2.4 1.6 0 2.7 1 2.7 2.4 0 2-2.7 2.2-2.7 4" />
      <circle cx="12.2" cy="17" r=".7" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M4.5 6.5h15M9.2 6.5V4.2h5.6v2.3M6.7 6.5l.8 13h9l.8-13M10 10v6M14 10v6" />
    </svg>
  );
}

export function ShuffleIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M4 7h2.4c4.4 0 6.8 10 11.2 10H20" />
      <path d="M4 17h2.4c1.7 0 3.1-1.5 4.5-3.4M13.3 9.7C14.3 8.2 15.4 7 17.6 7H20" />
      <path d="m17.5 4.5 2.5 2.5-2.5 2.5M17.5 14.5l2.5 2.5-2.5 2.5" />
    </svg>
  );
}

export function SparkleIcon(props: IconProps) {
  return (
    <svg {...baseProps({ ...props, fill: "currentColor", strokeWidth: 0 })}>
      <path d="M12 2.4c.8 5.4 2.9 7.5 8.3 8.3-5.4.8-7.5 2.9-8.3 8.3-.8-5.4-2.9-7.5-8.3-8.3 5.4-.8 7.5-2.9 8.3-8.3Z" />
      <path d="M19 16.2c.3 1.7 1.1 2.5 2.8 2.8-1.7.3-2.5 1.1-2.8 2.8-.3-1.7-1.1-2.5-2.8-2.8 1.7-.3 2.5-1.1 2.8-2.8Z" opacity=".7" />
    </svg>
  );
}

export function FeatherIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M20 4.2c-5.4.3-11 4.4-12.8 9.8L5.5 19l5-1.7c5.4-1.8 9.5-7.4 9.5-13.1Z" />
      <path d="M5.2 19.2 13.7 10M9.3 13.4l5 .3M11 9.9l.2 5.2" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M12 3.5v11M7.5 10.5 12 15l4.5-4.5M4.5 19.5h15" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="m4.5 12.5 4.6 4.6L19.5 6.8" />
    </svg>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="12" cy="12" r="8.7" />
      <path d="M12 10.8v5.3" />
      <circle cx="12" cy="7.8" r=".7" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ResetIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M4.5 10.5A7.5 7.5 0 1 1 6 17.2" />
      <path d="M4.2 5.8v5h5" />
    </svg>
  );
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M19 12H5M10.5 6.5 5 12l5.5 5.5" />
    </svg>
  );
}

export function StarRatingIcon({
  filled = false,
  ...props
}: IconProps & { filled?: boolean }) {
  return (
    <svg
      {...baseProps({
        ...props,
        fill: filled ? "currentColor" : "none",
        strokeWidth: 1.4,
      })}
    >
      <path d="M12 3.3 14.7 9l6.1.8-4.5 4.3 1.1 6.1L12 17.3l-5.4 2.9 1.1-6.1-4.5-4.3L9.3 9 12 3.3Z" />
    </svg>
  );
}

export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="18" cy="18" r="15.2" stroke="currentColor" strokeOpacity=".22" />
      <path
        d="M8.5 23.5 14 14.2l5.8 4.9 7.7-8.4"
        stroke="currentColor"
        strokeWidth="1"
        strokeOpacity=".6"
      />
      <circle cx="8.5" cy="23.5" r="1.6" fill="currentColor" />
      <circle cx="14" cy="14.2" r="1.2" fill="currentColor" />
      <circle cx="19.8" cy="19.1" r="1.4" fill="currentColor" />
      <circle cx="27.5" cy="10.7" r="1.8" fill="currentColor" />
      <circle cx="24" cy="27" r="1" fill="currentColor" opacity=".55" />
    </svg>
  );
}
