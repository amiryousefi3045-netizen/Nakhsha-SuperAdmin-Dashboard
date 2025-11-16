import { useEffect, useRef, useState } from "react";

// A lightweight drag-up bottom sheet for mobile (snap points: collapsed, mid, expanded)
// Props:
//  - header: ReactNode always visible (count summary / filters button)
//  - children: sheet scrollable content (list)
//  - initial: 'collapsed' | 'mid' | 'expanded'
//  - onSnapChange(level)
export default function MobileBottomSheet({
  header,
  children,
  initial = "collapsed",
  onSnapChange,
}) {
  const sheetRef = useRef(null);
  const dragRef = useRef(null);
  const startYRef = useRef(0);
  const startHRef = useRef(0);
  const [vh, setVh] = useState(() => window.innerHeight);
  const SNAP = useRef({ collapsed: 140, mid: 0.55, expanded: 0.88 }); // px for collapsed else fraction of vh
  const [height, setHeight] = useState(0);
  const levelRef = useRef(initial);

  // compute initial height
  useEffect(() => {
    const h = calcHeight(initial, window.innerHeight, SNAP.current);
    setHeight(h);
  }, [initial]);

  useEffect(() => {
    const onResize = () => {
      const newVh = window.innerHeight;
      setVh(newVh);
      // Re-evaluate current level's pixel height
      setHeight(calcHeight(levelRef.current, newVh, SNAP.current));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onPointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return; // only primary
    startYRef.current = e.clientY || e.touches?.[0]?.clientY;
    startHRef.current = height;
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp, { once: true });
  };
  const onPointerMove = (e) => {
    const currentY = e.clientY || e.touches?.[0]?.clientY;
    const dy = currentY - startYRef.current; // positive when moving down
    let newH = startHRef.current - dy; // dragging up increases height
    const maxH = calcHeight("expanded", vh, SNAP.current);
    const minH = calcHeight("collapsed", vh, SNAP.current);
    if (newH < minH) newH = minH;
    if (newH > maxH) newH = maxH;
    setHeight(newH);
  };
  const onPointerUp = () => {
    document.removeEventListener("pointermove", onPointerMove);
    // snap to nearest level
    const levels = ["collapsed", "mid", "expanded"]; // order small->large
    const distances = levels.map((lvl) => ({
      lvl,
      d: Math.abs(height - calcHeight(lvl, vh, SNAP.current)),
    }));
    distances.sort((a, b) => a.d - b.d);
    const nearest = distances[0].lvl;
    levelRef.current = nearest;
    setHeight(calcHeight(nearest, vh, SNAP.current));
    onSnapChange && onSnapChange(nearest);
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
}

function calcHeight(level, vh, SNAP) {
  if (level === "collapsed") return SNAP.collapsed; // px
  if (level === "mid") return Math.round(SNAP.mid * vh);
  return Math.round(SNAP.expanded * vh);
}
