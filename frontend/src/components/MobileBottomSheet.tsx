import { useEffect, useRef, useState, type FC, type ReactNode } from "react";

type SnapLevel = "collapsed" | "mid" | "expanded";

interface SnapConfig {
  collapsed: number;
  mid: number;
  expanded: number;
}

interface MobileBottomSheetProps {
  header?: ReactNode;
  children: ReactNode;
  initial?: SnapLevel;
  onSnapChange?: (level: SnapLevel) => void;
}

function calcHeight(level: SnapLevel, vh: number, SNAP: SnapConfig): number {
  if (level === "collapsed") return SNAP.collapsed;
  if (level === "mid") return Math.round(SNAP.mid * vh);
  return Math.round(SNAP.expanded * vh);
}

const MobileBottomSheet: FC<MobileBottomSheetProps> = ({
  header,
  children,
  initial = "collapsed",
  onSnapChange,
}) => {
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const startHRef = useRef(0);
  const [vh, setVh] = useState(() => window.innerHeight);
  const SNAP = useRef<SnapConfig>({
    collapsed: 140,
    mid: 0.55,
    expanded: 0.88,
  });
  const [height, setHeight] = useState(0);
  const levelRef = useRef<SnapLevel>(initial);

  useEffect(() => {
    const h = calcHeight(initial, window.innerHeight, SNAP.current);
    setHeight(h);
  }, [initial]);

  useEffect(() => {
    const onResize = () => {
      const newVh = window.innerHeight;
      setVh(newVh);
      setHeight(calcHeight(levelRef.current, newVh, SNAP.current));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onPointerMove = (e: PointerEvent) => {
    const currentY = e.clientY;
    const dy = currentY - startYRef.current;
    let newH = startHRef.current - dy;
    const maxH = calcHeight("expanded", vh, SNAP.current);
    const minH = calcHeight("collapsed", vh, SNAP.current);
    if (newH < minH) newH = minH;
    if (newH > maxH) newH = maxH;
    setHeight(newH);
  };

  const onPointerUp = () => {
    document.removeEventListener("pointermove", onPointerMove);
    const levels: SnapLevel[] = ["collapsed", "mid", "expanded"];
    const distances = levels.map((lvl) => ({
      lvl,
      d: Math.abs(height - calcHeight(lvl, vh, SNAP.current)),
    }));
    distances.sort((a, b) => a.d - b.d);
    const nearest = distances[0].lvl;
    levelRef.current = nearest;
    setHeight(calcHeight(nearest, vh, SNAP.current));
    onSnapChange?.(nearest);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    startYRef.current = e.clientY;
    startHRef.current = height;
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp, { once: true });
  };

  return (
    <div
      ref={sheetRef}
      className="fixed bottom-0 inset-x-0 z-40 bg-white rounded-t-2xl shadow-[0_-4px_16px_rgba(0,0,0,0.08)] border-t border-nakhsha-border flex flex-col overflow-hidden select-none will-change-[height]"
      style={{
        height: height ? height + "px" : undefined,
        transition: "height .25s cubic-bezier(0.4,0,0.2,1)",
        WebkitUserSelect: "none",
      }}
    >
      <div
        ref={dragRef}
        onPointerDown={onPointerDown}
        className="cursor-grab active:cursor-grabbing pt-2 px-4"
        style={{ touchAction: "none" }}
      >
        <div className="mx-auto w-10 h-1.5 rounded-full bg-nakhsha-border/60 mb-2" />
        {header}
      </div>
      <div className="flex-1 overflow-y-auto -mb-px thin-scrollbar">
        {children}
      </div>
    </div>
  );
};

export default MobileBottomSheet;
