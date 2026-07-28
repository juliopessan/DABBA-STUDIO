import { useCallback, useRef, useState } from "react";

// File drag-and-drop over the textarea. dragDepth avoids the classic
// flicker: dragleave fires when crossing child elements, so the highlight
// only turns off once the counter genuinely reaches zero.
export function useFileDrop(onFile: (file: File) => void) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    depth.current += 1;
    if (e.dataTransfer.types.includes("Files")) setDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    depth.current -= 1;
    if (depth.current <= 0) {
      depth.current = 0;
      setDragging(false);
    }
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) onFile(file);
    },
    [onFile]
  );

  return { dragging, dropHandlers: { onDragEnter, onDragLeave, onDragOver, onDrop } };
}
