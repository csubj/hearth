export function StarRating({
  rating,
  max = 5,
  className = "",
}: {
  rating: number | null | undefined;
  max?: number;
  className?: string;
}) {
  if (rating == null) {
    return null;
  }

  return (
    <span
      className={`inline-flex gap-0.5 text-accent ${className}`}
      aria-label={`${rating} out of ${max} stars`}
    >
      {Array.from({ length: max }, (_, index) => (
        <span key={index} aria-hidden="true">
          {index < rating ? "★" : "☆"}
        </span>
      ))}
    </span>
  );
}
