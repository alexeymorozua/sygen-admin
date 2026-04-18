import { useId } from "react";

type Props = {
  size?: number;
  className?: string;
};

export default function SygenLogo({ size = 28, className }: Props) {
  const gid = useId();
  const gradId = `sygen-grad-${gid}`;
  const maskId = `sygen-mask-${gid}`;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 512 512"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7DD3FC" />
          <stop offset="100%" stopColor="#1380EC" />
        </linearGradient>
        <mask id={maskId}>
          <rect width="512" height="512" fill="white" />
          <circle cx="256" cy="125" r="72" fill="black" />
        </mask>
      </defs>
      <path
        d="M256,125 L115,395 L397,395 Z"
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth="34"
        strokeLinecap="round"
        strokeLinejoin="round"
        mask={`url(#${maskId})`}
      />
      <path
        fillRule="evenodd"
        fill={`url(#${gradId})`}
        d="M256,125 m-72,0 a72,72 0 1,0 144,0 a72,72 0 1,0 -144,0 Z M256,125 m-38,0 a38,38 0 1,0 76,0 a38,38 0 1,0 -76,0 Z"
      />
      <circle cx="115" cy="395" r="62" fill={`url(#${gradId})`} />
      <circle cx="397" cy="395" r="62" fill={`url(#${gradId})`} />
    </svg>
  );
}
