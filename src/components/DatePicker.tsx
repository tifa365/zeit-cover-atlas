import { useState, useRef, useEffect } from "react";
import { DayPicker } from "react-day-picker";
import { de } from "date-fns/locale";
import "react-day-picker/style.css";
import "../styles/datepicker.css";

interface DatePickerProps {
  onDateSelect: (date: Date) => void;
  minDate: Date;
  maxDate: Date;
}

export default function DatePicker({
  onDateSelect,
  minDate,
  maxDate,
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [hasInteracted, setHasInteracted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleToggle = () => {
    if (!hasInteracted) setHasInteracted(true);
    setIsOpen(!isOpen);
  };

  const handleSelect = (date: Date | undefined) => {
    if (!date) return;
    setSelectedDate(date);
    setIsOpen(false);
    onDateSelect(date);
  };

  const formatDisplayDate = (date: Date) => {
    return date.toLocaleDateString("de-DE", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  return (
    <div className="datepicker" ref={containerRef}>
      <label htmlFor="birthdate-input" className="datepicker-label">
        Geben Sie Ihr Geburtsdatum ein
      </label>
      <button
        id="birthdate-input"
        type="button"
        className={`datepicker-trigger${!hasInteracted ? " pulse" : ""}`}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={handleToggle}
      >
        {selectedDate ? (
          <span className="datepicker-date-text">
            {formatDisplayDate(selectedDate)}
          </span>
        ) : (
          <span className="datepicker-placeholder">Datum auswählen</span>
        )}
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="datepicker-icon"
        >
          <path
            d="M13 4L7 10L1 4"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="datepicker-popover" role="dialog">
          <DayPicker
            mode="single"
            selected={selectedDate}
            onSelect={handleSelect}
            locale={de}
            defaultMonth={selectedDate || new Date(1990, 0)}
            startMonth={minDate}
            endMonth={maxDate}
            captionLayout="dropdown"
            fromYear={minDate.getFullYear()}
            toYear={maxDate.getFullYear()}
            disabled={[
              { before: minDate },
              { after: maxDate },
            ]}
          />
        </div>
      )}
    </div>
  );
}
