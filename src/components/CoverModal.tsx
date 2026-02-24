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
}

export default function CoverModal({
  cover,
  index,
  totalCovers,
  onClose,
  onPrev,
  onNext,
}: CoverModalProps) {
  if (!cover) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    if (e.key === "ArrowLeft") onPrev();
    if (e.key === "ArrowRight") onNext();
  };

  return (
    <AnimatePresence>
      {cover && (
        <motion.div
          className="modal-backdrop"
          onClick={handleBackdropClick}
          onKeyDown={handleKeyDown}
          tabIndex={-1}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          ref={(el) => el?.focus()}
        >
          <motion.div
            className="modal-content"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="modal-header">
              <h2>Ausgabe {cover.issue}</h2>
              <div className="modal-date">
                {formatGermanDate(cover.start)}
              </div>
            </div>

            <div className="modal-image-wrapper">
              <button className="modal-close" onClick={onClose} aria-label="Schließen">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </button>

              <img
                src={getCoverUrl(cover.id)}
                alt={`ZEIT Ausgabe ${cover.issue}`}
                loading="eager"
              />

              {index > 0 && (
                <button
                  className="modal-nav modal-nav-prev"
                  onClick={onPrev}
                  aria-label="Vorherige Ausgabe"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M10 1L4 7L10 13" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </button>
              )}

              {index < totalCovers - 1 && (
                <button
                  className="modal-nav modal-nav-next"
                  onClick={onNext}
                  aria-label="Nächste Ausgabe"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M4 1L10 7L4 13" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </button>
              )}
            </div>

            <div className="modal-footer">
              <a
                href={getArchiveUrl(cover.issue)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Texte aus dieser Ausgabe online lesen
              </a>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
