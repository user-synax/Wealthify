"use client";

export function isAvatarUrl(value) {
  if (typeof value !== "string" || !value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export default function Avatar({ value, name, className }) {
  const showImage = isAvatarUrl(value);

  return (
    <span aria-hidden="true" className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-navy font-semibold text-on-dark ${className}`}>
      <span>{showImage ? name.slice(0, 1).toUpperCase() : value || name.slice(0, 1).toUpperCase()}</span>
      {showImage && <img src={value} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} className="absolute inset-0 h-full w-full object-cover" />}
    </span>
  );
}