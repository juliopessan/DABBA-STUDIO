interface IconProps {
  size?: number;
  strokeWidth?: number;
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none" as const,
  xmlns: "http://www.w3.org/2000/svg",
});

const stroke = (w: number) => ({
  stroke: "currentColor",
  strokeWidth: w,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

/* ── Per-agent icons ────────────────────────────────────────────────── */

// @discovery — compass: exploration, charting unknown ground
export function DiscoveryIcon({ size = 22, strokeWidth = 1.6 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="9" {...stroke(strokeWidth)} />
      <path d="M15.5 8.5l-2 5-5 2 2-5 5-2z" {...stroke(strokeWidth)} />
    </svg>
  );
}

// @prd — document with listed requirements
export function PrdIcon({ size = 22, strokeWidth = 1.6 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" {...stroke(strokeWidth)} />
      <path d="M14 3v5h5" {...stroke(strokeWidth)} />
      <path d="M9 13h6M9 16.5h4" {...stroke(strokeWidth)} />
    </svg>
  );
}

// @architect — stacked layers: architecture in tiers
export function ArchitectIcon({ size = 22, strokeWidth = 1.6 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M12 3l9 5-9 5-9-5 9-5z" {...stroke(strokeWidth)} />
      <path d="M3 13l9 5 9-5" {...stroke(strokeWidth)} />
      <path d="M3 17.5l9 5 9-5" {...stroke(strokeWidth)} opacity="0.45" />
    </svg>
  );
}

// @backlog — kanban columns
export function BacklogIcon({ size = 22, strokeWidth = 1.6 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="3" y="4" width="6" height="16" rx="1.5" {...stroke(strokeWidth)} />
      <rect x="12" y="4" width="6" height="10" rx="1.5" {...stroke(strokeWidth)} />
      <path d="M21 4v6" {...stroke(strokeWidth)} opacity="0.45" />
    </svg>
  );
}

// @business-case — bar chart trending upward
export function BusinessCaseIcon({ size = 22, strokeWidth = 1.6 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 20V10M10 20V5M16 20v-7M22 20H2" {...stroke(strokeWidth)} />
      <path d="M4 7l6-4 6 5 5-3" {...stroke(strokeWidth)} opacity="0.45" />
    </svg>
  );
}

const AGENT_ICONS: Record<string, (p: IconProps) => JSX.Element> = {
  discovery: DiscoveryIcon,
  prd: PrdIcon,
  architect: ArchitectIcon,
  architecture: ArchitectIcon,
  backlog: BacklogIcon,
  "business-case": BusinessCaseIcon,
};

export function AgentIcon({ id, size = 22, strokeWidth = 1.6 }: IconProps & { id: string }) {
  const Icon = AGENT_ICONS[id] ?? PrdIcon;
  return <Icon size={size} strokeWidth={strokeWidth} />;
}

/* ── UI icons ───────────────────────────────────────────────────────── */

export function UploadIcon({ size = 16, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M12 16V4M12 4L7 9M12 4l5 5" {...stroke(strokeWidth)} />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" {...stroke(strokeWidth)} />
    </svg>
  );
}

export function FileIcon({ size = 14, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" {...stroke(strokeWidth)} />
      <path d="M14 3v5h5" {...stroke(strokeWidth)} />
    </svg>
  );
}

export function PlayIcon({ size = 16, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M7 4.5l12 7.5-12 7.5v-15z" {...stroke(strokeWidth)} />
    </svg>
  );
}

export function ExternalIcon({ size = 16, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M14 4h6v6" {...stroke(strokeWidth)} />
      <path d="M20 4l-9 9" {...stroke(strokeWidth)} />
      <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" {...stroke(strokeWidth)} />
    </svg>
  );
}

export function AlertIcon({ size = 15, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="9" {...stroke(strokeWidth)} />
      <path d="M12 7.5v5M12 16.2v.3" {...stroke(strokeWidth)} />
    </svg>
  );
}

export function SunIcon({ size = 16, strokeWidth = 1.7 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="4" {...stroke(strokeWidth)} />
      <path
        d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
        {...stroke(strokeWidth)}
      />
    </svg>
  );
}

export function MoonIcon({ size = 16, strokeWidth = 1.7 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" {...stroke(strokeWidth)} />
    </svg>
  );
}
