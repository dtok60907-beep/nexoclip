"use client";

import * as React from "react";

export type NxIconName =
  | "panel-left"
  | "home"
  | "apps"
  | "projects"
  | "media"
  | "director"
  | "canvas"
  | "video"
  | "image"
  | "cinema"
  | "ai-influencer"
  | "motion"
  | "publish"
  | "ads"
  | "analytics"
  | "accounts"
  | "usage"
  | "billing"
  | "settings"
  | "chat"
  | "filmmaking"
  | "audio"
  | "vibe-motion"
  | "lipsync"
  | "body-swap"
  | "marketing"
  | "plus"
  | "close"
  | "send"
  | "file"
  | "chevron-left"
  | "chevron-right"
  | "arrow-left"
  | "arrow-right"
  | "bolt"
  | "check"
  | "search"
  | "menu";

interface NxIconProps extends React.SVGProps<SVGSVGElement> {
  name: NxIconName | string;
  size?: number;
  strokeWidth?: number;
}

export function NxIcon({
  name,
  size = 18,
  strokeWidth = 1.65,
  className,
  style,
  ...props
}: NxIconProps) {
  const iconStyle = {
    "--od-icon-size": `${size}px`,
    width: `${size}px`,
    height: `${size}px`,
    ...style,
  } as React.CSSProperties;

  return (
    <svg
      className={`od-icon${className ? ` ${className}` : ""}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      shapeRendering="geometricPrecision"
      style={iconStyle}
      aria-hidden="true"
      {...props}
    >
      {renderPaths(name)}
    </svg>
  );
}

function renderPaths(name: string) {
  switch (name) {
    case "panel-left":
      return (
        <>
          <rect width="18" height="18" x="3" y="3" rx="4" />
          <path d="M9 3v18" />
        </>
      );

    case "home":
      return (
        <>
          <path d="M15 21v-7a1.5 1.5 0 0 0-1.5-1.5h-3A1.5 1.5 0 0 0 9 14v7" />
          <path d="M3 10.2a2 2 0 0 1 .72-1.54l7-5.83a2 2 0 0 1 2.56 0l7 5.83A2 2 0 0 1 21 10.2V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </>
      );

    case "apps":
      return (
        <>
          <rect width="7" height="7" x="3" y="3" rx="2.2" />
          <rect width="7" height="7" x="14" y="3" rx="2.2" />
          <rect width="7" height="7" x="14" y="14" rx="2.2" />
          <rect width="7" height="7" x="3" y="14" rx="2.2" />
        </>
      );

    case "projects":
      return (
        <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
      );

    case "media":
      return (
        <>
          <path d="M18 22H4a2 2 0 0 1-2-2V6" />
          <rect width="16" height="16" x="6" y="2" rx="3" />
          <circle cx="11" cy="7" r="1.5" />
          <path d="m22 13-3.3-3.3a2.4 2.4 0 0 0-3.4 0L9 16" />
        </>
      );

    case "director":
      return (
        <>
          <path d="M5 6.86a2.1 2.1 0 0 1 3.16-1.81l8.68 5.14a2.1 2.1 0 0 1 0 3.62l-8.68 5.14A2.1 2.1 0 0 1 5 17.14V6.86Z" />
          <path d="M19 3v4" />
          <path d="M17 5h4" />
        </>
      );

    case "canvas":
      return (
        <>
          <circle cx="6" cy="12" r="2.5" />
          <circle cx="18" cy="6" r="2.5" />
          <circle cx="18" cy="18" r="2.5" />
          <path d="m8.3 10.8 7.4-3.6" />
          <path d="m8.3 13.2 7.4 3.6" />
        </>
      );

    case "video":
      return (
        <>
          <rect width="14" height="14" x="2" y="5" rx="3" />
          <path d="m16 10 4.55-2.28A1 1 0 0 1 22 8.62v6.76a1 1 0 0 1-1.45.9L16 14Z" />
        </>
      );

    case "image":
      return (
        <>
          <rect width="18" height="18" x="3" y="3" rx="3.5" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21" />
        </>
      );

    case "cinema":
    case "filmmaking":
      return (
        <>
          <path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z" />
          <path d="m6.2 5.3 3.1 3.9" />
          <path d="m12.4 3.4 3.1 4" />
          <path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
        </>
      );

    case "ai-influencer":
      return (
        <>
          <circle cx="10" cy="8" r="4" />
          <path d="M3 20a7 7 0 0 1 14 0" />
          <path d="M19 3v4" />
          <path d="M17 5h4" />
        </>
      );

    case "motion":
    case "vibe-motion":
      return (
        <>
          <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
          <path d="m2.5 12 8.67 3.91a2 2 0 0 0 1.66 0L21.5 12" />
          <path d="m2.5 16.8 8.67 3.91a2 2 0 0 0 1.66 0L21.5 16.8" />
        </>
      );

    case "publish":
      return (
        <>
          <path d="M14.54 21.69a.5.5 0 0 0 .93-.03l6.5-19a.5.5 0 0 0-.63-.63l-19 6.5a.5.5 0 0 0-.03.93l7.93 3.18a2 2 0 0 1 1.11 1.11z" />
          <path d="M21.85 2.15 10.91 13.09" />
        </>
      );

    case "ads":
      return (
        <>
          <path d="M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
          <path d="M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14" />
          <path d="M8 6v8" />
        </>
      );

    case "analytics":
      return (
        <>
          <path d="M3 3v16a2 2 0 0 0 2 2h16" />
          <path d="m7 15 4-4 3 3 5-6" />
          <path d="M16 8h3v3" />
        </>
      );

    case "accounts":
      return (
        <>
          <path d="M9 17H7A5 5 0 0 1 7 7h2" />
          <path d="M15 7h2a5 5 0 1 1 0 10h-2" />
          <line x1="8" x2="16" y1="12" y2="12" />
        </>
      );

    case "usage":
    case "billing":
      return (
        <>
          <rect width="20" height="14" x="2" y="5" rx="3" />
          <line x1="2" x2="22" y1="10" y2="10" />
          <line x1="6" x2="10" y1="15" y2="15" />
        </>
      );

    case "settings":
      return (
        <>
          <line x1="21" x2="14" y1="5" y2="5" />
          <line x1="10" x2="3" y1="5" y2="5" />
          <line x1="21" x2="12" y1="12" y2="12" />
          <line x1="8" x2="3" y1="12" y2="12" />
          <line x1="21" x2="16" y1="19" y2="19" />
          <line x1="12" x2="3" y1="19" y2="19" />
          <circle cx="12" cy="5" r="2" />
          <circle cx="10" cy="12" r="2" />
          <circle cx="14" cy="19" r="2" />
        </>
      );

    case "chat":
    case "marketing":
      return (
        <>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          <path d="M8 9h8" />
          <path d="M8 13h5" />
        </>
      );

    case "audio":
      return (
        <>
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </>
      );

    case "lipsync":
      return (
        <>
          <rect width="6" height="11" x="9" y="2" rx="3" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" x2="12" y1="19" y2="22" />
        </>
      );

    case "body-swap":
      return (
        <>
          <circle cx="9" cy="7" r="4" />
          <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
          <path d="m17 11 2 2 4-4" />
        </>
      );

    case "plus":
      return <path d="M12 5v14M5 12h14" />;

    case "close":
      return <path d="M18 6 6 18M6 6l12 12" />;

    case "send":
      return <path d="M12 19V5m-6 6 6-6 6 6" />;

    case "file":
      return (
        <>
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
          <path d="M14 2v4a2 2 0 0 0 2 2h4" />
        </>
      );

    case "chevron-left":
      return <path d="m15 18-6-6 6-6" />;

    case "chevron-right":
      return <path d="m9 18 6-6-6-6" />;

    case "arrow-left":
      return <path d="M19 12H5m6-6-6 6 6 6" />;

    case "arrow-right":
      return <path d="M5 12h14m-6-6 6 6-6 6" />;

    case "bolt":
      return (
        <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
      );

    case "check":
      return <path d="M20 6 9 17l-5-5" />;

    case "search":
      return (
        <>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </>
      );

    case "menu":
      return <path d="M4 7h16M4 12h16M4 17h16" />;

    default:
      return <rect width="16" height="16" x="4" y="4" rx="3" />;
  }
}

export default NxIcon;
