import React from 'react';

interface BrandLogoProps {
  compact?: boolean;
  showTagline?: boolean;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  compact = false,
  showTagline = false,
}) => {
  return (
    <div className="flex items-center gap-2.5 select-none shrink-0">
      <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#5146E5] to-[#2563EB] shadow-sm shadow-[#5146E5]/20 shrink-0">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          {/* Outer protective shield silhouette */}
          <path
            d="M12 2.5L4.5 5.6V11.3C4.5 16.2 7.7 20.4 12 21.8C16.3 20.4 19.5 16.2 19.5 11.3V5.6L12 2.5Z"
            stroke="white"
            strokeWidth="1.75"
            strokeLinejoin="round"
            fill="white"
            fillOpacity="0.12"
          />
          {/* API network signal pulse across shield */}
          <path
            d="M6.8 12.2H9.3L10.9 8.8L13.1 15.1L14.7 11.7H17.2"
            stroke="white"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Trust boundary node points */}
          <circle cx="6.8" cy="12.2" r="1.25" fill="#99F6E4" />
          <circle cx="17.2" cy="11.7" r="1.25" fill="#99F6E4" />
        </svg>
      </div>
      {!compact && (
        <div className="flex flex-col leading-none">
          <span className="font-[var(--font-display)] text-[15px] font-extrabold tracking-tight text-[#172033] whitespace-nowrap">
            API <span className="text-[#5146E5]">SENTINEL</span>
          </span>
          {showTagline && (
            <span className="mt-1 text-[11px] font-medium text-[#64748B] whitespace-nowrap">
              Detect the Drift. Protect the Trust.
            </span>
          )}
        </div>
      )}
    </div>
  );
};
