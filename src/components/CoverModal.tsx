import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { CoverEntry } from "../utils/coverLookup";
import { formatGermanDate } from "../utils/coverLookup";
import { getCoverUrl, getArchiveUrl } from "../utils/coverUrl";
import "../styles/modal.css";

interface CoverModalProps {
  cover: CoverEntry | null;
  index: number;
  totalCovers: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  resultLabel?: string; // e.g. "Treffer 3 von 15"
}

const MAGNIFIER_SIZE = 160;
const ZOOM = 2;

export default function CoverModal({
  cover,
  index,
  totalCovers,
  onClose,
  onPrev,
  onNext,
  hasPrev = true,
  hasNext = true,
  resultLabel,
}: CoverModalProps) {
  const [glass, setGlass] = useState({ active: false, x: 0, y: 0 });
  const figureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!cover) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "ArrowRight") onNext();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [cover, onClose, onPrev, onNext]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setGlass({ active: true, x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setGlass((prev) => ({ ...prev, active: false }));
  }, []);

  if (!cover) return null;

  // "2017/20" → "20 / 2017"
  const [year, num] = cover.issue.split("/");
  const coverUrl = getCoverUrl(cover.id);

  // Magnifier background math
  const el = figureRef.current;
  const imgW = el?.clientWidth ?? 0;
  const imgH = el?.clientHeight ?? 0;
  const bgW = imgW * ZOOM;
  const bgH = imgH * ZOOM;
  const bgX = -(glass.x * ZOOM - MAGNIFIER_SIZE / 2);
  const bgY = -(glass.y * ZOOM - MAGNIFIER_SIZE / 2);

  return (
    <AnimatePresence>
      {cover && (
        <motion.div
          className="modal-backdrop"
          onClick={(e) => e.target === e.currentTarget && onClose()}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="modal-card"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <figcaption className="modal-title">
              <strong>Ausgabe {num} / {year}</strong>
              {formatGermanDate(cover.start)}
              {resultLabel && (
                <span className="modal-result-label">{resultLabel}</span>
              )}
            </figcaption>

            <figure className="modal-figure">
              <div
                ref={figureRef}
                className="modal-magnifier"
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
              >
                <img
                  src={coverUrl}
                  alt={`ZEIT Ausgabe ${cover.issue}`}
                  loading="eager"
                />
                <div
                  className={`modal-glass${glass.active && imgW > 0 ? " active" : ""}`}
                  aria-hidden="true"
                  style={{
                    width: MAGNIFIER_SIZE,
                    height: MAGNIFIER_SIZE,
                    left: glass.x - MAGNIFIER_SIZE / 2,
                    top: glass.y - MAGNIFIER_SIZE / 2,
                    backgroundImage: `url(${coverUrl})`,
                    backgroundSize: `${bgW}px ${bgH}px`,
                    backgroundPosition: `${bgX}px ${bgY}px`,
                  }}
                />
              </div>
            </figure>

            <button className="modal-close" onClick={onClose}>
              <svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="15" cy="15" r="14.25" stroke="currentColor" strokeWidth="1.5" />
                <rect x="20.4907" y="9" width="1.25" height="16" rx="0.625" transform="rotate(45 20.4907 9)" fill="currentColor" />
                <rect x="21.1978" y="20.3135" width="1.25" height="16" rx="0.625" transform="rotate(135 21.1978 20.3135)" fill="currentColor" />
              </svg>
            </button>

            <button className="modal-prev" onClick={onPrev} disabled={!hasPrev}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10 1L4 7L10 13" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>

            <button className="modal-next" onClick={onNext} disabled={!hasNext}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 1L10 7L4 13" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>

            <a
              href={getArchiveUrl(cover.issue)}
              target="_blank"
              rel="noreferrer"
              className="modal-link"
            >
              Texte aus dieser Ausgabe online lesen
            </a>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
