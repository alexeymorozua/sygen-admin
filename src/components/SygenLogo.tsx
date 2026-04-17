type Props = {
  size?: number;
  className?: string;
};

export default function SygenLogo({ size = 28, className }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 512 512"
      className={className}
      aria-hidden="true"
    >
      <circle cx="256" cy="256" r="50" fill="currentColor" />
      <circle cx="256" cy="256" r="105" fill="none" stroke="currentColor" strokeWidth="22" opacity="0.75" />
      <circle cx="256" cy="256" r="160" fill="none" stroke="currentColor" strokeWidth="18" opacity="0.45" />
    </svg>
  );
}
