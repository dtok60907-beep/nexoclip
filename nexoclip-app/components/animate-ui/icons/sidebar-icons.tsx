"use client";

import * as React from "react";
import { motion, type Variants } from "motion/react";
import {
  getVariants,
  IconWrapper,
  useAnimateIconContext,
  type IconProps,
} from "./icon";

function BaseSvg({
  size = 18,
  className,
  style,
  children,
  ...props
}: IconProps) {
  return (
    <motion.svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={{
        ["--od-icon-size" as string]: `${size}px`,
        width: `${size}px`,
        height: `${size}px`,
        overflow: "visible",
        ...style,
      }}
      {...props}
    >
      {children}
    </motion.svg>
  );
}

/* 1. Home */
const homeVariants = {
  default: {
    roof: {
      initial: { y: 0 },
      animate: { y: [0, -1.6, 0], transition: { duration: 0.42, ease: "easeInOut" } },
    },
    door: {
      initial: { scaleY: 1, originY: 1 },
      animate: { scaleY: [1, 0.72, 1], transition: { duration: 0.42, ease: "easeInOut" } },
    },
  } satisfies Record<string, Variants>,
};

function HomeSvg(props: IconProps) {
  const { controls } = useAnimateIconContext();
  const variants = getVariants(homeVariants);
  return (
    <BaseSvg {...props}>
      <motion.path
        d="M3 10.2a2 2 0 0 1 .72-1.54l7-5.83a2 2 0 0 1 2.56 0l7 5.83A2 2 0 0 1 21 10.2V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
        variants={variants.roof}
        initial="initial"
        animate={controls}
      />
      <motion.path
        d="M15 21v-7a1.5 1.5 0 0 0-1.5-1.5h-3A1.5 1.5 0 0 0 9 14v7"
        variants={variants.door}
        initial="initial"
        animate={controls}
        style={{ transformOrigin: "12px 21px" }}
      />
    </BaseSvg>
  );
}

/* 2. Apps (LayoutGrid) */
const appsVariants = {
  default: {
    tl: { initial: { scale: 1 }, animate: { scale: [1, 0.82, 1], transition: { duration: 0.36, delay: 0 } } },
    tr: { initial: { scale: 1 }, animate: { scale: [1, 0.82, 1], transition: { duration: 0.36, delay: 0.06 } } },
    br: { initial: { scale: 1 }, animate: { scale: [1, 0.82, 1], transition: { duration: 0.36, delay: 0.12 } } },
    bl: { initial: { scale: 1 }, animate: { scale: [1, 0.82, 1], transition: { duration: 0.36, delay: 0.18 } } },
  } satisfies Record<string, Variants>,
};

function AppsSvg(props: IconProps) {
  const { controls } = useAnimateIconContext();
  const variants = getVariants(appsVariants);
  return (
    <BaseSvg {...props}>
      <motion.rect width="7" height="7" x="3" y="3" rx="2.2" variants={variants.tl} initial="initial" animate={controls} style={{ transformOrigin: "6.5px 6.5px" }} />
      <motion.rect width="7" height="7" x="14" y="3" rx="2.2" variants={variants.tr} initial="initial" animate={controls} style={{ transformOrigin: "17.5px 6.5px" }} />
      <motion.rect width="7" height="7" x="14" y="14" rx="2.2" variants={variants.br} initial="initial" animate={controls} style={{ transformOrigin: "17.5px 17.5px" }} />
      <motion.rect width="7" height="7" x="3" y="14" rx="2.2" variants={variants.bl} initial="initial" animate={controls} style={{ transformOrigin: "6.5px 17.5px" }} />
    </BaseSvg>
  );
}

/* 3. Projects (Folder) */
const folderVariants = {
  default: {
    body: {
      initial: { rotate: 0, y: 0 },
      animate: { rotate: [0, -5, 2, 0], y: [0, -1, 0], transition: { duration: 0.45, ease: "easeInOut" } },
    },
  } satisfies Record<string, Variants>,
};

function ProjectsSvg(props: IconProps) {
  const { controls } = useAnimateIconContext();
  const variants = getVariants(folderVariants);
  return (
    <BaseSvg {...props}>
      <motion.path
        d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"
        variants={variants.body}
        initial="initial"
        animate={controls}
        style={{ transformOrigin: "12px 18px" }}
      />
    </BaseSvg>
  );
}

/* 4. Media Library (Images) */
const mediaVariants = {
  default: {
    front: {
      initial: { x: 0, y: 0 },
      animate: { x: [0, 1.4, 0], y: [0, -1.4, 0], transition: { duration: 0.42, ease: "easeInOut" } },
    },
    back: {
      initial: { x: 0, y: 0 },
      animate: { x: [0, -0.8, 0], y: [0, 0.8, 0], transition: { duration: 0.42, ease: "easeInOut" } },
    },
  } satisfies Record<string, Variants>,
};

function MediaSvg(props: IconProps) {
  const { controls } = useAnimateIconContext();
  const variants = getVariants(mediaVariants);
  return (
    <BaseSvg {...props}>
      <motion.path d="M18 22H4a2 2 0 0 1-2-2V6" variants={variants.back} initial="initial" animate={controls} />
      <motion.g variants={variants.front} initial="initial" animate={controls}>
        <rect width="16" height="16" x="6" y="2" rx="3" />
        <circle cx="11" cy="7" r="1.5" />
        <path d="m22 13-3.3-3.3a2.4 2.4 0 0 0-3.4 0L9 16" />
      </motion.g>
    </BaseSvg>
  );
}

/* 5. AI Director (Play + Sparkle) */
const directorVariants = {
  default: {
    play: {
      initial: { x: 0 },
      animate: { x: [0, 1.8, 0], transition: { duration: 0.4, ease: "easeInOut" } },
    },
    spark: {
      initial: { rotate: 0, scale: 1 },
      animate: { rotate: [0, 90], scale: [1, 1.22, 1], transition: { duration: 0.46, ease: "easeInOut" } },
    },
  } satisfies Record<string, Variants>,
};

function DirectorSvg(props: IconProps) {
  const { controls } = useAnimateIconContext();
  const variants = getVariants(directorVariants);
  return (
    <BaseSvg {...props}>
      <motion.path
        d="M5 6.86a2.1 2.1 0 0 1 3.16-1.81l8.68 5.14a2.1 2.1 0 0 1 0 3.62l-8.68 5.14A2.1 2.1 0 0 1 5 17.14V6.86Z"
        variants={variants.play}
        initial="initial"
        animate={controls}
      />
      <motion.g variants={variants.spark} initial="initial" animate={controls} style={{ transformOrigin: "19px 5px" }}>
        <path d="M19 3v4" />
        <path d="M17 5h4" />
      </motion.g>
    </BaseSvg>
  );
}

/* 6. Canvas Editor (Nodes) */
const canvasVariants = {
  default: {
    left: { initial: { scale: 1 }, animate: { scale: [1, 1.2, 1], transition: { duration: 0.4 } } },
    top: { initial: { x: 0, y: 0 }, animate: { x: [0, 1.2, 0], y: [0, -1, 0], transition: { duration: 0.4, delay: 0.05 } } },
    bottom: { initial: { x: 0, y: 0 }, animate: { x: [0, 1.2, 0], y: [0, 1, 0], transition: { duration: 0.4, delay: 0.1 } } },
  } satisfies Record<string, Variants>,
};

function CanvasSvg(props: IconProps) {
  const { controls } = useAnimateIconContext();
  const variants = getVariants(canvasVariants);
  return (
    <BaseSvg {...props}>
      <path d="m8.3 10.8 7.4-3.6" />
      <path d="m8.3 13.2 7.4 3.6" />
      <motion.circle cx="6" cy="12" r="2.5" variants={variants.left} initial="initial" animate={controls} style={{ transformOrigin: "6px 12px" }} />
      <motion.circle cx="18" cy="6" r="2.5" variants={variants.top} initial="initial" animate={controls} />
      <motion.circle cx="18" cy="18" r="2.5" variants={variants.bottom} initial="initial" animate={controls} />
    </BaseSvg>
  );
}

/* 7. Video Studio */
const videoVariants = {
  default: {
    group: {
      initial: { rotate: 0 },
      animate: { rotate: [0, -5, 3, 0], transition: { duration: 0.44, ease: "easeInOut" } },
    },
    lens: {
      initial: { x: 0 },
      animate: { x: [0, 1.2, 0], transition: { duration: 0.44, ease: "easeInOut" } },
    },
  } satisfies Record<string, Variants>,
};

function VideoSvg(props: IconProps) {
  const { controls } = useAnimateIconContext();
  const variants = getVariants(videoVariants);
  return (
    <BaseSvg {...props}>
      <motion.g variants={variants.group} initial="initial" animate={controls} style={{ transformOrigin: "10px 12px" }}>
        <rect width="14" height="14" x="2" y="5" rx="3" />
        <motion.path d="m16 10 4.55-2.28A1 1 0 0 1 22 8.62v6.76a1 1 0 0 1-1.45.9L16 14Z" variants={variants.lens} initial="initial" animate={controls} />
      </motion.g>
    </BaseSvg>
  );
}

/* 8. Image Studio */
const imageVariants = {
  default: {
    sun: {
      initial: { scale: 1, y: 0 },
      animate: { scale: [1, 1.28, 1], y: [0, -0.8, 0], transition: { duration: 0.42, ease: "easeInOut" } },
    },
    hill: {
      initial: { pathLength: 1 },
      animate: { pathLength: [0.35, 1], transition: { duration: 0.45, ease: "easeOut" } },
    },
  } satisfies Record<string, Variants>,
};

function ImageSvg(props: IconProps) {
  const { controls } = useAnimateIconContext();
  const variants = getVariants(imageVariants);
  return (
    <BaseSvg {...props}>
      <rect width="18" height="18" x="3" y="3" rx="3.5" />
      <motion.circle cx="9" cy="9" r="2" variants={variants.sun} initial="initial" animate={controls} style={{ transformOrigin: "9px 9px" }} />
      <motion.path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21" variants={variants.hill} initial="initial" animate={controls} />
    </BaseSvg>
  );
}

/* 9. Cinema Studio / Filmmaking (Clapperboard) */
const clapperVariants = {
  default: {
    slate: {
      initial: { rotate: 0 },
      animate: { rotate: [0, -15, 3, 0], transition: { duration: 0.5, ease: "easeInOut" } },
    },
  } satisfies Record<string, Variants>,
};

function CinemaSvg(props: IconProps) {
  const { controls } = useAnimateIconContext();
  const variants = getVariants(clapperVariants);
  return (
    <BaseSvg {...props}>
      <motion.g variants={variants.slate} initial="initial" animate={controls} style={{ transformOrigin: "3px 11px" }}>
        <path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z" />
        <path d="m6.2 5.3 3.1 3.9" />
        <path d="m12.4 3.4 3.1 4" />
      </motion.g>
      <path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </BaseSvg>
  );
}

/* 10. AI Influencer (User + Sparkle) */
const influencerVariants = {
  default: {
    head: {
      initial: { y: 0 },
      animate: { y: [0, -1.4, 0], transition: { duration: 0.42, ease: "easeInOut" } },
    },
    spark: {
      initial: { rotate: 0, scale: 1 },
      animate: { rotate: [0, 90], scale: [1, 1.25, 1], transition: { duration: 0.45, ease: "easeInOut" } },
    },
  } satisfies Record<string, Variants>,
};

function InfluencerSvg(props: IconProps) {
  const { controls } = useAnimateIconContext();
  const variants = getVariants(influencerVariants);
  return (
    <BaseSvg {...props}>
      <motion.circle cx="10" cy="8" r="4" variants={variants.head} initial="initial" animate={controls} />
      <path d="M3 20a7 7 0 0 1 14 0" />
      <motion.g variants={variants.spark} initial="initial" animate={controls} style={{ transformOrigin: "19px 5px" }}>
        <path d="M19 3v4" />
        <path d="M17 5h4" />
      </motion.g>
    </BaseSvg>
  );
}

/* 11. Motion (Layers) */
const layersVariants = {
  default: {
    top: { initial: { y: 0 }, animate: { y: [0, -1.8, 0], transition: { duration: 0.44, ease: "easeInOut" } } },
    mid: { initial: { y: 0 }, animate: { y: [0, 0.2, 0], transition: { duration: 0.44, ease: "easeInOut" } } },
    bot: { initial: { y: 0 }, animate: { y: [0, 1.8, 0], transition: { duration: 0.44, ease: "easeInOut" } } },
  } satisfies Record<string, Variants>,
};

function MotionLayersSvg(props: IconProps) {
  const { controls } = useAnimateIconContext();
  const variants = getVariants(layersVariants);
  return (
    <BaseSvg {...props}>
      <motion.path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" variants={variants.top} initial="initial" animate={controls} />
      <motion.path d="m2.5 12 8.67 3.91a2 2 0 0 0 1.66 0L21.5 12" variants={variants.mid} initial="initial" animate={controls} />
      <motion.path d="m2.5 16.8 8.67 3.91a2 2 0 0 0 1.66 0L21.5 16.8" variants={variants.bot} initial="initial" animate={controls} />
    </BaseSvg>
  );
}

/* 12. Social Publishing (Send) */
const sendVariants = {
  default: {
    plane: {
      initial: { x: 0, y: 0, scale: 1 },
      animate: { x: [0, 2.2, 0], y: [0, -2.2, 0], scale: [1, 0.94, 1], transition: { duration: 0.46, ease: "easeInOut" } },
    },
  } satisfies Record<string, Variants>,
};

function PublishSvg(props: IconProps) {
  const { controls } = useAnimateIconContext();
  const variants = getVariants(sendVariants);
  return (
    <BaseSvg {...props}>
      <motion.g variants={variants.plane} initial="initial" animate={controls}>
        <path d="M14.54 21.69a.5.5 0 0 0 .93-.03l6.5-19a.5.5 0 0 0-.63-.63l-19 6.5a.5.5 0 0 0-.03.93l7.93 3.18a2 2 0 0 1 1.11 1.11z" />
        <path d="M21.85 2.15 10.91 13.09" />
      </motion.g>
    </BaseSvg>
  );
}

/* 13. Ads Manager (Megaphone) */
const adsVariants = {
  default: {
    horn: {
      initial: { rotate: 0 },
      animate: { rotate: [0, -11, 4, 0], transition: { duration: 0.48, ease: "easeInOut" } },
    },
  } satisfies Record<string, Variants>,
};

function AdsSvg(props: IconProps) {
  const { controls } = useAnimateIconContext();
  const variants = getVariants(adsVariants);
  return (
    <BaseSvg {...props}>
      <motion.g variants={variants.horn} initial="initial" animate={controls} style={{ transformOrigin: "6px 12px" }}>
        <path d="M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
        <path d="M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14" />
        <path d="M8 6v8" />
      </motion.g>
    </BaseSvg>
  );
}

/* 14. Analytics (TrendingUp) */
const analyticsVariants = {
  default: {
    line: {
      initial: { pathLength: 1, opacity: 1 },
      animate: { pathLength: [0.15, 1], transition: { duration: 0.48, ease: "easeOut" } },
    },
    arrow: {
      initial: { x: 0, y: 0 },
      animate: { x: [0, 1.4, 0], y: [0, -1.4, 0], transition: { duration: 0.48, ease: "easeOut" } },
    },
  } satisfies Record<string, Variants>,
};

function AnalyticsSvg(props: IconProps) {
  const { controls } = useAnimateIconContext();
  const variants = getVariants(analyticsVariants);
  return (
    <BaseSvg {...props}>
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <motion.path d="m7 15 4-4 3 3 5-6" variants={variants.line} initial="initial" animate={controls} />
      <motion.path d="M16 8h3v3" variants={variants.arrow} initial="initial" animate={controls} />
    </BaseSvg>
  );
}

/* 15. Integration Apps (Link) */
const linkVariants = {
  default: {
    left: { initial: { x: 0 }, animate: { x: [0, 1.2, 0], transition: { duration: 0.4, ease: "easeInOut" } } },
    right: { initial: { x: 0 }, animate: { x: [0, -1.2, 0], transition: { duration: 0.4, ease: "easeInOut" } } },
  } satisfies Record<string, Variants>,
};

function AccountsSvg(props: IconProps) {
  const { controls } = useAnimateIconContext();
  const variants = getVariants(linkVariants);
  return (
    <BaseSvg {...props}>
      <motion.path d="M9 17H7A5 5 0 0 1 7 7h2" variants={variants.left} initial="initial" animate={controls} />
      <motion.path d="M15 7h2a5 5 0 1 1 0 10h-2" variants={variants.right} initial="initial" animate={controls} />
      <line x1="8" x2="16" y1="12" y2="12" />
    </BaseSvg>
  );
}

/* 16. Usage & Billing (CreditCard) */
const cardVariants = {
  default: {
    card: {
      initial: { y: 0, rotate: 0 },
      animate: { y: [0, -1.2, 0], rotate: [0, -3, 2, 0], transition: { duration: 0.44, ease: "easeInOut" } },
    },
    bar: {
      initial: { scaleX: 1 },
      animate: { scaleX: [1, 1.35, 1], transition: { duration: 0.44, ease: "easeInOut" } },
    },
  } satisfies Record<string, Variants>,
};

function UsageSvg(props: IconProps) {
  const { controls } = useAnimateIconContext();
  const variants = getVariants(cardVariants);
  return (
    <BaseSvg {...props}>
      <motion.g variants={variants.card} initial="initial" animate={controls} style={{ transformOrigin: "12px 12px" }}>
        <rect width="20" height="14" x="2" y="5" rx="3" />
        <line x1="2" x2="22" y1="10" y2="10" />
        <motion.line x1="6" x2="10" y1="15" y2="15" variants={variants.bar} initial="initial" animate={controls} style={{ transformOrigin: "6px 15px" }} />
      </motion.g>
    </BaseSvg>
  );
}

/* 17. Settings (SlidersHorizontal — iconic Animate UI sliders) */
const slidersVariants = {
  default: {
    k1: { initial: { x: 0 }, animate: { x: [0, -3, 0], transition: { duration: 0.48, ease: "easeInOut" } } },
    k2: { initial: { x: 0 }, animate: { x: [0, 3.5, 0], transition: { duration: 0.48, ease: "easeInOut" } } },
    k3: { initial: { x: 0 }, animate: { x: [0, -2.5, 0], transition: { duration: 0.48, ease: "easeInOut" } } },
  } satisfies Record<string, Variants>,
};

function SettingsSvg(props: IconProps) {
  const { controls } = useAnimateIconContext();
  const variants = getVariants(slidersVariants);
  return (
    <BaseSvg {...props}>
      <line x1="21" x2="3" y1="5" y2="5" strokeOpacity={0.35} />
      <line x1="21" x2="3" y1="12" y2="12" strokeOpacity={0.35} />
      <line x1="21" x2="3" y1="19" y2="19" strokeOpacity={0.35} />
      <motion.circle cx="13" cy="5" r="2.2" fill="var(--nx-sidebar-icon-fill, #ffffff)" variants={variants.k1} initial="initial" animate={controls} />
      <motion.circle cx="9" cy="12" r="2.2" fill="var(--nx-sidebar-icon-fill, #ffffff)" variants={variants.k2} initial="initial" animate={controls} />
      <motion.circle cx="15" cy="19" r="2.2" fill="var(--nx-sidebar-icon-fill, #ffffff)" variants={variants.k3} initial="initial" animate={controls} />
    </BaseSvg>
  );
}

/* 18. PanelLeft (Sidebar Toggle) */
const panelLeftVariants = {
  default: {
    divider: {
      initial: { x: 0 },
      animate: { x: [0, -1.6, 0], transition: { duration: 0.38, ease: "easeInOut" } },
    },
  } satisfies Record<string, Variants>,
};

function PanelLeftSvg(props: IconProps) {
  const { controls } = useAnimateIconContext();
  const variants = getVariants(panelLeftVariants);
  return (
    <BaseSvg {...props}>
      <rect width="18" height="18" x="3" y="3" rx="4" />
      <motion.path d="M9 3v18" variants={variants.divider} initial="initial" animate={controls} />
    </BaseSvg>
  );
}

/* 19. AI Ads Feature Icons (Ad Clone, Creative Insights, Account Audit, Competitors Analysis) */
const cloneVariants = {
  default: {
    front: { initial: { x: 0, y: 0 }, animate: { x: [0, 1.6, 0], y: [0, -1.6, 0], transition: { duration: 0.44, ease: "easeInOut" } } },
    back: { initial: { x: 0, y: 0 }, animate: { x: [0, -1.2, 0], y: [0, 1.2, 0], transition: { duration: 0.44, ease: "easeInOut" } } },
  } satisfies Record<string, Variants>,
};

function AdCloneSvg(props: IconProps) {
  const { controls } = useAnimateIconContext();
  const variants = getVariants(cloneVariants);
  return (
    <BaseSvg {...props}>
      <motion.rect width="11" height="11" x="9" y="3" rx="2.5" variants={variants.front} initial="initial" animate={controls} />
      <motion.path d="M5 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-1" variants={variants.back} initial="initial" animate={controls} />
    </BaseSvg>
  );
}

const auditVariants = {
  default: {
    shield: { initial: { scale: 1 }, animate: { scale: [1, 1.06, 1], transition: { duration: 0.42, ease: "easeInOut" } } },
    check: { initial: { pathLength: 1 }, animate: { pathLength: [0.1, 1], transition: { duration: 0.45, ease: "easeOut" } } },
  } satisfies Record<string, Variants>,
};

function AccountAuditSvg(props: IconProps) {
  const { controls } = useAnimateIconContext();
  const variants = getVariants(auditVariants);
  return (
    <BaseSvg {...props}>
      <motion.path
        d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"
        variants={variants.shield}
        initial="initial"
        animate={controls}
        style={{ transformOrigin: "12px 12px" }}
      />
      <motion.path d="m9 12 2 2 4-4" variants={variants.check} initial="initial" animate={controls} />
    </BaseSvg>
  );
}

const radarVariants = {
  default: {
    ring: { initial: { scale: 1 }, animate: { scale: [1, 0.9, 1], transition: { duration: 0.45, ease: "easeInOut" } } },
    sweep: { initial: { rotate: 0 }, animate: { rotate: [0, 35, 0], transition: { duration: 0.5, ease: "easeInOut" } } },
  } satisfies Record<string, Variants>,
};

function CompetitorsSvg(props: IconProps) {
  const { controls } = useAnimateIconContext();
  const variants = getVariants(radarVariants);
  return (
    <BaseSvg {...props}>
      <motion.circle cx="12" cy="12" r="9" variants={variants.ring} initial="initial" animate={controls} style={{ transformOrigin: "12px 12px" }} />
      <circle cx="12" cy="12" r="4.5" strokeOpacity={0.55} />
      <motion.path d="M12 12 18.2 5.8" variants={variants.sweep} initial="initial" animate={controls} style={{ transformOrigin: "12px 12px" }} />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </BaseSvg>
  );
}

export function PanelLeftAnimatedIcon(props: IconProps) {
  return <IconWrapper icon={PanelLeftSvg} {...props} />;
}

export function AdCloneAnimatedIcon(props: IconProps) {
  return <IconWrapper icon={AdCloneSvg} {...props} />;
}

export function CreativeInsightsAnimatedIcon(props: IconProps) {
  return <IconWrapper icon={AnalyticsSvg} {...props} />;
}

export function AccountAuditAnimatedIcon(props: IconProps) {
  return <IconWrapper icon={AccountAuditSvg} {...props} />;
}

export function CompetitorsAnimatedIcon(props: IconProps) {
  return <IconWrapper icon={CompetitorsSvg} {...props} />;
}

const SIDEBAR_ICON_MAP: Record<string, React.ComponentType<IconProps>> = {
  home: HomeSvg,
  apps: AppsSvg,
  projects: ProjectsSvg,
  media: MediaSvg,
  director: DirectorSvg,
  canvas: CanvasSvg,
  video: VideoSvg,
  image: ImageSvg,
  cinema: CinemaSvg,
  filmmaking: CinemaSvg,
  "ai-influencer": InfluencerSvg,
  motion: MotionLayersSvg,
  "vibe-motion": MotionLayersSvg,
  publish: PublishSvg,
  ads: AdsSvg,
  analytics: AnalyticsSvg,
  accounts: AccountsSvg,
  usage: UsageSvg,
  billing: UsageSvg,
  settings: SettingsSvg,
  "panel-left": PanelLeftSvg,
};

export function SidebarAnimatedIcon({
  name,
  size = 18,
  ...props
}: IconProps & { name: string }) {
  const Component = SIDEBAR_ICON_MAP[name] || HomeSvg;
  return <IconWrapper icon={Component} size={size} {...props} />;
}

export default SidebarAnimatedIcon;
