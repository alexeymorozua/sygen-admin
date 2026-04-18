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
          <circle cx="256" cy="143" r="65" fill="black" />
        </mask>
      </defs>
      <path
        d="M256,143 L129,386 L383,386 Z"
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth="31"
        strokeLinecap="round"
        strokeLinejoin="round"
        mask={`url(#${maskId})`}
      />
      <path
        fillRule="evenodd"
        fill={`url(#${gradId})`}
        d="M256,143 m-65,0 a65,65 0 1,0 130,0 a65,65 0 1,0 -130,0 Z M256,143 m-34,0 a34,34 0 1,0 68,0 a34,34 0 1,0 -68,0 Z"
      />
      <circle cx="129" cy="386" r="56" fill={`url(#${gradId})`} />
      <circle cx="383" cy="386" r="56" fill={`url(#${gradId})`} />
    </svg>
  );
}
